import { Buffer } from 'buffer';
import {
  pcmBase64ToWavBase64,
  sampleRateFromMimeType,
} from '../src/audio/pcmAudio';

describe('sampleRateFromMimeType', () => {
  it('parses the rate out of a pcm mime type', () => {
    expect(sampleRateFromMimeType('audio/pcm;rate=24000')).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm;rate=16000')).toBe(16000);
  });

  it('falls back to the default when missing or malformed', () => {
    expect(sampleRateFromMimeType(undefined)).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm')).toBe(24000);
    expect(sampleRateFromMimeType('audio/pcm', 8000)).toBe(8000);
  });
});

describe('pcmBase64ToWavBase64', () => {
  it('produces a valid WAV file that round-trips the original PCM bytes', () => {
    // 8 samples of 16-bit PCM = 16 bytes of raw audio data.
    const pcmBytes = Buffer.from(Array.from({ length: 16 }, (_, i) => i));
    const base64Pcm = pcmBytes.toString('base64');

    const wavBase64 = pcmBase64ToWavBase64(base64Pcm, 16000);
    const wavBytes = Buffer.from(wavBase64, 'base64');

    // 44-byte header + original data.
    expect(wavBytes.length).toBe(44 + pcmBytes.length);

    expect(wavBytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wavBytes.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wavBytes.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wavBytes.toString('ascii', 36, 40)).toBe('data');

    // RIFF chunk size = file length - 8.
    expect(wavBytes.readUInt32LE(4)).toBe(36 + pcmBytes.length);
    // PCM format tag.
    expect(wavBytes.readUInt16LE(20)).toBe(1);
    // Mono.
    expect(wavBytes.readUInt16LE(22)).toBe(1);
    // Sample rate as requested.
    expect(wavBytes.readUInt32LE(24)).toBe(16000);
    // 16-bit samples.
    expect(wavBytes.readUInt16LE(34)).toBe(16);
    // data chunk size matches the PCM payload length.
    expect(wavBytes.readUInt32LE(40)).toBe(pcmBytes.length);

    // The audio payload itself is untouched.
    const payload = wavBytes.subarray(44);
    expect(Buffer.compare(payload, pcmBytes)).toBe(0);
  });

  it('defaults to a 24kHz sample rate when none is given', () => {
    const wavBase64 = pcmBase64ToWavBase64(
      Buffer.from([1, 2]).toString('base64'),
    );
    const wavBytes = Buffer.from(wavBase64, 'base64');
    expect(wavBytes.readUInt32LE(24)).toBe(24000);
  });

  it('handles an empty PCM chunk without throwing', () => {
    const wavBase64 = pcmBase64ToWavBase64('');
    const wavBytes = Buffer.from(wavBase64, 'base64');
    expect(wavBytes.length).toBe(44);
    expect(wavBytes.readUInt32LE(40)).toBe(0);
  });
});
