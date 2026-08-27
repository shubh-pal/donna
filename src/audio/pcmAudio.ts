import { Buffer } from 'buffer';

/**
 * Pure helpers for turning the raw PCM audio chunks the Gemini Live API
 * sends (base64-encoded, 16-bit little-endian, mono) into playable WAV
 * files. Kept dependency-free (no native modules) so it's unit-testable
 * directly under Jest — actually *playing* the resulting file is the
 * native-module part (see `playbackQueue.ts`).
 */

const DEFAULT_SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/** Reads the sample rate out of a `audio/pcm;rate=24000`-style mime type. */
export function sampleRateFromMimeType(
  mimeType: string | undefined,
  fallback: number = DEFAULT_SAMPLE_RATE,
): number {
  if (!mimeType) return fallback;
  const match = /rate=(\d+)/.exec(mimeType);
  return match ? parseInt(match[1], 10) : fallback;
}

function buildWavHeader(
  dataLength: number,
  sampleRate: number,
  numChannels = NUM_CHANNELS,
  bitsPerSample = BITS_PER_SAMPLE,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format: 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Wraps a base64-encoded raw PCM chunk in a minimal WAV header and
 * returns the result, also base64-encoded, ready to write to a file and
 * hand to a standard audio player (e.g. react-native-sound, which
 * doesn't play raw headerless PCM).
 */
export function pcmBase64ToWavBase64(
  base64Pcm: string,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): string {
  const pcmBytes = Buffer.from(base64Pcm, 'base64');
  const header = buildWavHeader(pcmBytes.length, sampleRate);
  return Buffer.concat([header, pcmBytes]).toString('base64');
}

/**
 * Concatenates several base64 PCM chunks (as they arrive from the Live
 * API, one per `onAudioChunk` event) into a single WAV file's worth of
 * base64. Used by `playbackQueue.ts` to coalesce many small incoming
 * chunks into fewer, larger playback segments — see that file's doc
 * comment for why: playing every individual small chunk as its own
 * file/`Sound` instance produces an audible click/crack at every
 * segment boundary (a start/stop transition on the platform audio
 * track), and fewer, larger segments means fewer boundaries.
 */
export function combinePcmChunksToWavBase64(
  base64Chunks: string[],
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): string {
  const combined = Buffer.concat(
    base64Chunks.map(chunk => Buffer.from(chunk, 'base64')),
  );
  const header = buildWavHeader(combined.length, sampleRate);
  return Buffer.concat([header, combined]).toString('base64');
}

/**
 * How many bytes of 16-bit mono PCM correspond to `ms` milliseconds at
 * `sampleRate` — the unit `playbackQueue.ts` buffers incoming chunks
 * against before flushing them into one playable segment.
 */
export function bytesForDurationMs(
  ms: number,
  sampleRate: number,
  bitsPerSample = BITS_PER_SAMPLE,
  numChannels = NUM_CHANNELS,
): number {
  return Math.round((sampleRate * numChannels * (bitsPerSample / 8) * ms) / 1000);
}
