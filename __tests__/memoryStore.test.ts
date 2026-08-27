import {
  addFact,
  addFacts,
  buildMemoryContextBlock,
  clearAllFacts,
  deleteFact,
  listFacts,
  updateFact,
  type MemoryFact,
} from '../src/config/memoryStore';

describe('memoryStore', () => {
  beforeEach(async () => {
    await clearAllFacts();
  });

  it('starts empty', async () => {
    await expect(listFacts()).resolves.toEqual([]);
  });

  it('adds a fact with the given source', async () => {
    const fact = await addFact('Works as a product manager', 'onboarding');
    expect(fact).toMatchObject({
      text: 'Works as a product manager',
      source: 'onboarding',
    });
    await expect(listFacts()).resolves.toHaveLength(1);
  });

  it('skips an empty fact', async () => {
    await expect(addFact('   ', 'manual')).resolves.toBeNull();
    await expect(listFacts()).resolves.toEqual([]);
  });

  it('skips a near-duplicate fact (case/whitespace-insensitive containment)', async () => {
    await addFact('Lives in Austin, Texas', 'onboarding');
    const dup = await addFact('  lives in austin, texas  ', 'conversation');
    expect(dup).toBeNull();
    await expect(listFacts()).resolves.toHaveLength(1);
  });

  it('addFacts adds only the non-duplicate, non-empty ones and dedupes within the batch too', async () => {
    await addFact('Has a dog named Biscuit', 'onboarding');
    const added = await addFacts(
      [
        'Has a dog named Biscuit', // dup of existing
        'Prefers concise answers',
        'Prefers concise answers', // dup within the batch
        '   ', // empty
        'Works late on Thursdays',
      ],
      'conversation',
    );
    expect(added.map(f => f.text)).toEqual([
      'Prefers concise answers',
      'Works late on Thursdays',
    ]);
    await expect(listFacts()).resolves.toHaveLength(3);
  });

  it('lists facts oldest-first', async () => {
    await addFact('first fact', 'manual');
    await addFact('second fact', 'manual');
    const facts = await listFacts();
    expect(facts.map(f => f.text)).toEqual(['first fact', 'second fact']);
  });

  it('updates a fact\'s text', async () => {
    const fact = await addFact('Original text', 'manual');
    await updateFact(fact!.id, 'Corrected text');
    const facts = await listFacts();
    expect(facts[0].text).toBe('Corrected text');
    expect(facts[0].updatedAt).toBeGreaterThanOrEqual(facts[0].createdAt);
  });

  it('ignores an update to a nonexistent id', async () => {
    await addFact('Original text', 'manual');
    await updateFact('does-not-exist', 'Should not apply');
    const facts = await listFacts();
    expect(facts[0].text).toBe('Original text');
  });

  it('deletes a fact by id', async () => {
    const a = await addFact('Keep this one', 'manual');
    await addFact('Delete this one', 'manual');
    await deleteFact((await listFacts()).find(f => f.text === 'Delete this one')!.id);
    const facts = await listFacts();
    expect(facts.map(f => f.id)).toEqual([a!.id]);
  });

  it('clears all facts', async () => {
    await addFact('one', 'manual');
    await addFact('two', 'manual');
    await clearAllFacts();
    await expect(listFacts()).resolves.toEqual([]);
  });
});

describe('buildMemoryContextBlock', () => {
  it('returns an empty string for no facts', () => {
    expect(buildMemoryContextBlock([])).toBe('');
  });

  it('renders facts as a bulleted block', () => {
    const facts: MemoryFact[] = [
      {
        id: '1',
        text: 'Works as a product manager',
        source: 'onboarding',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: '2',
        text: 'Prefers concise answers',
        source: 'conversation',
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    const block = buildMemoryContextBlock(facts);
    expect(block).toContain('- Works as a product manager');
    expect(block).toContain('- Prefers concise answers');
  });

  it('caps at 40 facts, keeping the most recently updated', () => {
    const facts: MemoryFact[] = Array.from({ length: 45 }, (_, i) => ({
      id: `${i}`,
      text: `fact number ${i}`,
      source: 'manual' as const,
      createdAt: i,
      updatedAt: i,
    }));
    const block = buildMemoryContextBlock(facts);
    // The 5 oldest (lowest updatedAt: 0-4) should be dropped.
    expect(block).not.toContain('fact number 0\n');
    expect(block).toContain('fact number 44');
    expect(block).toContain('fact number 40');
  });
});
