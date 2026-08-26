import { GEMINI_LIVE_MODEL } from '../src/config/geminiLive';
import {
  AMBIENT_SILENCE_TOKEN,
  AMBIENT_SYSTEM_PROMPT,
  buildAmbientSetupMessage,
  shouldSuppressAmbientReply,
} from '../src/config/ambientLive';

describe('buildAmbientSetupMessage', () => {
  it('uses the same model as conversation mode, with the ambient persona', () => {
    const message = JSON.parse(buildAmbientSetupMessage());
    expect(message.setup.model).toBe(GEMINI_LIVE_MODEL);
    expect(message.setup.systemInstruction.parts[0].text).toBe(
      AMBIENT_SYSTEM_PROMPT,
    );
  });

  it('instructs the model on the silence token', () => {
    expect(AMBIENT_SYSTEM_PROMPT).toContain(AMBIENT_SILENCE_TOKEN);
  });

  it('requests audio responses and both transcription directions, like conversation mode', () => {
    const message = JSON.parse(buildAmbientSetupMessage());
    expect(message.setup.generationConfig.responseModalities).toEqual([
      'AUDIO',
    ]);
    expect(message.setup.inputAudioTranscription).toEqual({});
    expect(message.setup.outputAudioTranscription).toEqual({});
  });
});

describe('shouldSuppressAmbientReply', () => {
  it('suppresses an empty, null, or whitespace-only transcript', () => {
    expect(shouldSuppressAmbientReply('')).toBe(true);
    expect(shouldSuppressAmbientReply(null)).toBe(true);
    expect(shouldSuppressAmbientReply(undefined)).toBe(true);
    expect(shouldSuppressAmbientReply('   \n\t  ')).toBe(true);
  });

  it('suppresses the exact silence token', () => {
    expect(shouldSuppressAmbientReply(AMBIENT_SILENCE_TOKEN)).toBe(true);
  });

  it('suppresses the token regardless of case', () => {
    expect(shouldSuppressAmbientReply('<no_reply>')).toBe(true);
    expect(shouldSuppressAmbientReply('<No_Reply>')).toBe(true);
  });

  it('suppresses the token with incidental surrounding whitespace/punctuation', () => {
    expect(shouldSuppressAmbientReply(`  ${AMBIENT_SILENCE_TOKEN}  `)).toBe(
      true,
    );
    expect(shouldSuppressAmbientReply(`"${AMBIENT_SILENCE_TOKEN}."`)).toBe(
      true,
    );
  });

  it('does not suppress a genuine reply', () => {
    expect(
      shouldSuppressAmbientReply("You've said 'literally' four times now."),
    ).toBe(false);
  });

  it('does not suppress a genuine reply that merely mentions the token as part of a longer sentence', () => {
    // The model should never do this per the prompt, but the suppression
    // check itself only treats an *exact* (post-trim) match as silence —
    // partial containment must not accidentally swallow a real reply.
    expect(
      shouldSuppressAmbientReply(
        `${AMBIENT_SILENCE_TOKEN} is not a real word, by the way.`,
      ),
    ).toBe(false);
  });

  it('does not suppress a short but real reply', () => {
    expect(shouldSuppressAmbientReply('Nice catch.')).toBe(false);
  });
});
