import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';
import { pcmBase64ToWavBase64, sampleRateFromMimeType } from './pcmAudio';

Sound.setCategory('Playback');

type QueuedChunk = { base64Pcm: string; mimeType: string };

/**
 * Plays Gemini Live's PCM audio response chunks back-to-back.
 *
 * Design choice for Phase 2: react-native-sound (like most RN audio
 * players) plays *files*, not a raw PCM stream, so each incoming chunk
 * is wrapped in a WAV header (see pcmAudio.ts), written to a temp file,
 * and played sequentially. That means a small gap between chunks rather
 * than perfectly gapless playback — acceptable for a first pass, and
 * revisit with a native streaming player if it sounds choppy on a real
 * device (untested here — see NOTES.md).
 */
export class AudioPlaybackQueue {
  private queue: QueuedChunk[] = [];
  private currentSound: Sound | null = null;
  private currentPath: string | null = null;
  private fileCounter = 0;
  private stopped = false;

  constructor(
    private readonly onPlayingChange?: (isPlaying: boolean) => void,
  ) {}

  enqueue(base64Pcm: string, mimeType: string): void {
    if (this.stopped) return;
    this.queue.push({ base64Pcm, mimeType });
    if (!this.currentSound) {
      this.playNext();
    }
  }

  private async playNext(): Promise<void> {
    const next = this.queue.shift();
    if (!next) {
      this.onPlayingChange?.(false);
      return;
    }

    this.onPlayingChange?.(true);
    const sampleRate = sampleRateFromMimeType(next.mimeType);
    const wavBase64 = pcmBase64ToWavBase64(next.base64Pcm, sampleRate);
    const path = `${RNFS.DocumentDirectoryPath}/donna-live-${this
      .fileCounter++}.wav`;

    try {
      await RNFS.writeFile(path, wavBase64, 'base64');
    } catch {
      // Couldn't write this chunk to disk — skip it rather than stalling
      // the rest of the response.
      this.playNext();
      return;
    }

    if (this.stopped) {
      RNFS.unlink(path).catch(() => {});
      return;
    }

    this.currentPath = path;
    this.currentSound = new Sound(path, '', error => {
      if (error || this.stopped) {
        this.finishCurrent(path);
        return;
      }
      this.currentSound?.play(() => this.finishCurrent(path));
    });
  }

  private finishCurrent(path: string): void {
    this.currentSound?.release();
    this.currentSound = null;
    this.currentPath = null;
    RNFS.unlink(path).catch(() => {});
    if (!this.stopped) this.playNext();
  }

  /** Stops the currently-playing chunk and drops anything queued — used on barge-in/interruption. */
  clear(): void {
    this.queue = [];
    this.currentSound?.stop(() => {
      this.currentSound?.release();
      this.currentSound = null;
      if (this.currentPath) RNFS.unlink(this.currentPath).catch(() => {});
      this.currentPath = null;
    });
    this.onPlayingChange?.(false);
  }

  /** Permanently stops this queue (e.g. leaving the Conversation screen). */
  dispose(): void {
    this.stopped = true;
    this.clear();
  }
}
