import {
  clearAllSessions,
  deleteSession,
  listSessions,
  saveSession,
  searchSessions,
} from '../src/config/historyStore';
import { setSaveHistoryEnabled } from '../src/config/preferences';

describe('historyStore', () => {
  beforeEach(async () => {
    await clearAllSessions();
  });

  it('saves a session by default (the history preference defaults to on), titled from the first user message', async () => {
    await saveSession('s1', [
      { speaker: 'you', text: 'Plan my day' },
      { speaker: 'donna', text: "Here's the plan." },
    ]);

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 's1', title: 'Plan my day' });
    expect(sessions[0].messages).toHaveLength(2);
  });

  it('does not save anything once the history preference is explicitly turned off', async () => {
    await setSaveHistoryEnabled(false);
    await saveSession('s1', [{ speaker: 'you', text: 'hello' }]);
    await expect(listSessions()).resolves.toEqual([]);
  });

  it('overwrites an existing session by id rather than duplicating it', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('s1', [{ speaker: 'you', text: 'first' }]);
    await saveSession('s1', [
      { speaker: 'you', text: 'first' },
      { speaker: 'donna', text: 'second' },
    ]);

    const sessions = await listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].messages).toHaveLength(2);
  });

  it('does not save an empty message list', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('empty', []);
    await expect(listSessions()).resolves.toEqual([]);
  });

  it('lists sessions most-recently-updated first', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('older', [{ speaker: 'you', text: 'first one' }]);
    await saveSession('newer', [{ speaker: 'you', text: 'second one' }]);

    const sessions = await listSessions();
    expect(sessions.map(s => s.id)).toEqual(['newer', 'older']);
  });

  it('searches by title and by message content, case-insensitively', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('a', [{ speaker: 'you', text: 'Talk about the budget' }]);
    await saveSession('b', [
      { speaker: 'you', text: 'Something else' },
      { speaker: 'donna', text: 'The Budget looks fine.' },
    ]);
    await saveSession('c', [{ speaker: 'you', text: 'Unrelated topic' }]);

    const results = await searchSessions('budget');
    expect(results.map(s => s.id).sort()).toEqual(['a', 'b']);
  });

  it('deletes one session by id', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('a', [{ speaker: 'you', text: 'keep' }]);
    await saveSession('b', [{ speaker: 'you', text: 'remove' }]);

    await deleteSession('b');
    const sessions = await listSessions();
    expect(sessions.map(s => s.id)).toEqual(['a']);
  });

  it('clears all sessions', async () => {
    await setSaveHistoryEnabled(true);
    await saveSession('a', [{ speaker: 'you', text: 'one' }]);
    await saveSession('b', [{ speaker: 'you', text: 'two' }]);

    await clearAllSessions();
    await expect(listSessions()).resolves.toEqual([]);
  });
});
