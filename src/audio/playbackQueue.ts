import { Buffer } from 'buffer';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';
import {
  bytesForDurationMs,
  combinePcmChunksToWavBase64,
  sampleRateFromMimeType,
} from './pcmAudio';

Sound.setCategory('Playback');

// How much audio to buffer before turning it into one playable segment.
// The Live API streams a response as many small chunks (well under
// this), and playing each one as its own file/Sound instance produces
// an audible click/crack at every segment boundary — a start/stop
// transition on the platform's audio track, which is the "voice
// cracks" a real user actually heard. Coalescing into ~700ms segments
// trades a small amount of latency (audio starts once the first
// segment's worth has arrived, not on the very first chunk) for far
// fewer of those boundaries. `flush()` (called on turn-complete) plays
// out whatever's left buffered even if it's short of this, so trailing
// audio is never dropped.
const SEGMENT_TARGET_MS = 700;

type PreparedSegment = { sound: Sound; path: string };

/**
 * Plays Gemini Live's PCM audio response chunks back-to-back.
 *
 * react-native-sound (like most RN audio players) plays *files*, not a
 * raw PCM stream, so incoming chunks are buffered, periodically
 * coalesced into one WAV file per `SEGMENT_TARGET_MS` window (see
 * above), written to a temp file, and played sequentially. The *next*
 * segment is also pre-written-and-loaded (not started) while the
 * current one is still playing, so the handoff between segments is a
 * plain `.play()` call on an already-decoded `Sound` rather than
 * waiting on disk I/O + decode at the transition — removing the gap
 * that would otherwise open between file-based segments on top of the
 * inherent per-segment click.
 */
export class AudioPlaybackQueue {
  private pendingChunks: string[] = [];
  private pendingBytes = 0;
  private pendingSampleRate: number | null = null;

  private queue: { wavBase64: string }[] = [];
  private currentSound: Sound | null = null;
  private currentPath: string | null = null;
  private preparedNext: PreparedSegment | null = null;
  private preparingNext = false;
  private fileCounter = 0;
  private stopped = false;

  constructor(
    private readonly onPlayingChange?: (isPlaying: boolean) => void,
  ) {}

  enqueue(base64Pcm: string, mimeType: string): void {
    if (this.stopped) return;
    const sampleRate = sampleRateFromMimeType(mimeType);
    // Chunks within one turn should share a sample rate; if it somehow
    // changes mid-stream, flush what's buffered at the old rate first
    // rather than mixing rates in one WAV header.
    if (this.pendingSampleRate !== null && this.pendingSampleRate !== sampleRate) {
      this.flush();
    }
    this.pendingSampleRate = sampleRate;
    this.pendingChunks.push(base64Pcm);
    this.pendingBytes += Buffer.from(base64Pcm, 'base64').length;

    if (this.pendingBytes >= bytesForDurationMs(SEGMENT_TARGET_MS, sampleRate)) {
      this.flushPendingToQueue();
    }
  }

  /**
   * Moves whatever's currently buffered into the play queue as one
   * segment, even if it's short of the target duration — call this
   * when a turn ends so the last, sub-threshold bit of audio still
   * gets played instead of silently dropped.
   */
  flush(): void {
    this.flushPendingToQueue();
  }

  private flushPendingToQueue(): void {
    if (this.pendingChunks.length === 0) return;
    const wavBase64 = combinePcmChunksToWavBase64(
      this.pendingChunks,
      this.pendingSampleRate ?? undefined,
    );
    this.pendingChunks = [];
    this.pendingBytes = 0;

    this.queue.push({ wavBase64 });
    if (!this.currentSound) {
      this.playNext();
    } else {
      this.prepareNextIfNeeded();
    }
  }

  private async writeAndLoad(wavBase64: string): Promise<PreparedSegment | null> {
    const path = `${RNFS.DocumentDirectoryPath}/donna-live-${this
      .fileCounter++}.wav`;
    try {
      await RNFS.writeFile(path, wavBase64, 'base64');
    } catch {
      return null;
    }
    if (this.stopped) {
      RNFS.unlink(path).catch(() => {});
      return null;
    }
    return new Promise(resolve => {
      const sound = new Sound(path, '', error => {
        if (error || this.stopped) {
          sound.release();
          RNFS.unlink(path).catch(() => {});
          resolve(null);
          return;
        }
        resolve({ sound, path });
      });
    });
  }

  private async prepareNextIfNeeded(): Promise<void> {
    if (this.preparedNext || this.preparingNext) return;
    const next = this.queue.shift();
    if (!next) return;
    this.preparingNext = true;
    const prepared = await this.writeAndLoad(next.wavBase64);
    this.preparingNext = false;
    if (this.stopped) return;
    if (prepared) {
      this.preparedNext = prepared;
    } else {
      // Couldn't prepare this one — skip it and try the one after,
      // rather than stalling the rest of the response.
      this.prepareNextIfNeeded();
    }
  }

  private async playNext(): Promise<void> {
    let segment = this.preparedNext;
    this.preparedNext = null;

    if (!segment) {
      const next = this.queue.shift();
      if (!next) {
        this.onPlayingChange?.(false);
        return;
      }
      this.onPlayingChange?.(true);
      const prepared = await this.writeAndLoad(next.wavBase64);
      if (this.stopped) return;
      if (!prepared) {
        this.playNext();
        return;
      }
      segment = prepared;
    } else {
      this.onPlayingChange?.(true);
    }

    this.currentSound = segment.sound;
    this.currentPath = segment.path;
    // Start loading the *next* segment now, in parallel with this one
    // playing, so the transition when this one finishes is instant.
    this.prepareNextIfNeeded();

    segment.sound.play(() => this.finishCurrent(segment!.path));
  }

  private finishCurrent(path: string): void {
    this.currentSound?.release();
    this.currentSound = null;
    this.currentPath = null;
    RNFS.unlink(path).catch(() => {});
    if (!this.stopped) this.playNext();
  }

  /** Stops the currently-playing segment and drops anything queued or pre-loaded — used on barge-in/interruption. */
  clear(): void {
    this.pendingChunks = [];
    this.pendingBytes = 0;
    this.queue = [];
    if (this.preparedNext) {
      this.preparedNext.sound.release();
      RNFS.unlink(this.preparedNext.path).catch(() => {});
      this.preparedNext = null;
    }
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
