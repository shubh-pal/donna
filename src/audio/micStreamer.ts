import LiveAudioStream from 'react-native-live-audio-stream';
import { LIVE_INPUT_SAMPLE_RATE } from '../config/geminiLive';

// audioSource 6 = VOICE_RECOGNITION on Android — tuned for speech rather
// than music, with the platform's own noise suppression/AGC applied
// where available.
const ANDROID_VOICE_RECOGNITION_SOURCE = 6;

const STREAM_OPTIONS = {
  sampleRate: LIVE_INPUT_SAMPLE_RATE,
  channels: 1,
  bitsPerSample: 16,
  audioSource: ANDROID_VOICE_RECOGNITION_SOURCE,
  bufferSize: 4096,
  // Required by the library's types on Android; we consume chunks via
  // the 'data' event below rather than this file.
  wavFile: 'donna_mic_stream.wav',
};

/**
 * Wraps react-native-live-audio-stream to capture the mic as base64-
 * encoded 16-bit PCM chunks at the sample rate Gemini Live expects,
 * matching the format geminiLive.ts sends over the websocket.
 *
 * Unverified on a real device in this sandbox (no mic hardware here) —
 * see NOTES.md.
 */
export class MicStreamer {
  private started = false;
  private initialized = false;

  constructor(private readonly onChunk: (base64Pcm: string) => void) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    // init() + the 'data' listener are only registered once — the
    // underlying native module is a singleton with no listener-removal
    // API, so re-registering on every start() would stack duplicate
    // listeners across multiple hold-to-talk presses.
    if (!this.initialized) {
      this.initialized = true;
      LiveAudioStream.init(STREAM_OPTIONS);
      LiveAudioStream.on('data', this.onChunk);
    }
    LiveAudioStream.start();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    LiveAudioStream.stop();
  }
}
