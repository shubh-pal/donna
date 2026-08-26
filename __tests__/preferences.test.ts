import {
  getSaveHistoryEnabled,
  setSaveHistoryEnabled,
} from '../src/config/preferences';

describe('preferences: save conversation history', () => {
  it('defaults to false when never set', async () => {
    await expect(getSaveHistoryEnabled()).resolves.toBe(false);
  });

  it('persists true/false across reads', async () => {
    await setSaveHistoryEnabled(true);
    await expect(getSaveHistoryEnabled()).resolves.toBe(true);

    await setSaveHistoryEnabled(false);
    await expect(getSaveHistoryEnabled()).resolves.toBe(false);
  });
});
