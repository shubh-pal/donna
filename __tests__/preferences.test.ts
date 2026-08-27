import {
  getAmbientModeConfirmed,
  getAmbientModeEnabled,
  getSaveHistoryEnabled,
  setAmbientModeConfirmed,
  setAmbientModeEnabled,
  setSaveHistoryEnabled,
} from '../src/config/preferences';

describe('preferences: save conversation history', () => {
  it('defaults to true when never set', async () => {
    await expect(getSaveHistoryEnabled()).resolves.toBe(true);
  });

  it('persists true/false across reads', async () => {
    await setSaveHistoryEnabled(true);
    await expect(getSaveHistoryEnabled()).resolves.toBe(true);

    await setSaveHistoryEnabled(false);
    await expect(getSaveHistoryEnabled()).resolves.toBe(false);

    // And back on again — not just "false survives", the default
    // isn't a one-way trapdoor.
    await setSaveHistoryEnabled(true);
    await expect(getSaveHistoryEnabled()).resolves.toBe(true);
  });
});

describe('preferences: ambient mode enabled', () => {
  it('defaults to false when never set', async () => {
    await expect(getAmbientModeEnabled()).resolves.toBe(false);
  });

  it('persists true/false across reads', async () => {
    await setAmbientModeEnabled(true);
    await expect(getAmbientModeEnabled()).resolves.toBe(true);

    await setAmbientModeEnabled(false);
    await expect(getAmbientModeEnabled()).resolves.toBe(false);
  });
});

describe('preferences: ambient mode confirmation dialog seen', () => {
  it('defaults to false when never set — the dialog should show on first enable', async () => {
    await expect(getAmbientModeConfirmed()).resolves.toBe(false);
  });

  it('persists true across reads once the user confirms', async () => {
    await setAmbientModeConfirmed(true);
    await expect(getAmbientModeConfirmed()).resolves.toBe(true);
  });
});
