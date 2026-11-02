import {
  copyScopeProgress, hasScopeProgress, MAX_STORED_SCOPES, patchScopeProgress, readScopePicks, readScopeProgress,
  setScopePick, SHOPPING_PROGRESS_STORAGE_KEY
} from './shopping-progress-storage';

describe('shopping progress storage', () => {
  beforeEach(() => localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY));

  it('keeps each build\'s ticks apart', () => {
    patchScopeProgress('saved:a', { 'g|Ring1|Ring': 1 });
    patchScopeProgress('draft', { 'g|Helm|Hat': 0 });

    expect(readScopeProgress('saved:a')).toEqual({ 'g|Ring1|Ring': 1 });
    expect(readScopeProgress('draft')).toEqual({ 'g|Helm|Hat': 0 });
    expect(readScopeProgress('saved:b')).toEqual({});
    expect(hasScopeProgress('saved:b')).toBe(false);
  });

  it('changes only the keys a patch names, so another tab\'s ticks survive', () => {
    patchScopeProgress('draft', { a: 1 });
    // Another tab writes b behind this one's back.
    const stored = JSON.parse(localStorage.getItem(SHOPPING_PROGRESS_STORAGE_KEY)!);
    stored.scopes.draft.entries.b = 1;
    localStorage.setItem(SHOPPING_PROGRESS_STORAGE_KEY, JSON.stringify(stored));

    expect(patchScopeProgress('draft', { a: null, c: 0 })).toEqual({ b: 1, c: 0 });
  });

  it('forgets a build with nothing ticked, and the least recently changed beyond the limit', () => {
    patchScopeProgress('draft', { a: 1 });
    patchScopeProgress('draft', { a: null });
    expect(JSON.parse(localStorage.getItem(SHOPPING_PROGRESS_STORAGE_KEY)!).scopes).toEqual({});

    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i <= MAX_STORED_SCOPES; i++) {
      now.mockReturnValue(1000 + i);
      patchScopeProgress(`saved:${i}`, { a: 1 });
    }
    expect(hasScopeProgress('saved:0')).toBe(false);
    expect(hasScopeProgress('saved:1')).toBe(true);
    expect(hasScopeProgress(`saved:${MAX_STORED_SCOPES}`)).toBe(true);
  });

  it('keeps each build\'s picks beside its ticks, and forgets a build only when it has neither', () => {
    setScopePick('draft', 'augment|Ruby', ['Lahar', 'Vendor']);
    patchScopeProgress('draft', { a: 1 });
    patchScopeProgress('draft', { a: null });

    expect(readScopePicks('draft')).toEqual({ 'augment|Ruby': ['Lahar', 'Vendor'] });
    expect(readScopeProgress('draft')).toEqual({});
    expect(readScopePicks('saved:a')).toEqual({});

    expect(setScopePick('draft', 'augment|Ruby', null)).toEqual({});
    expect(hasScopeProgress('draft')).toBe(false);
  });

  it('copies ticks and picks to another build, the copy\'s own winning', () => {
    setScopePick('draft', 'augment|Ruby', ['Lahar']);
    setScopePick('draft', 'augment|Topaz', ['Vendor']);
    setScopePick('saved:x', 'augment|Topaz', ['Lahar']);

    copyScopeProgress('draft', 'saved:x', true);
    expect(readScopePicks('saved:x')).toEqual({ 'augment|Ruby': ['Lahar'], 'augment|Topaz': ['Lahar'] });
    expect(hasScopeProgress('draft')).toBe(false);
  });

  it('copies ticks to another build, the copy\'s own winning, optionally moving them', () => {
    patchScopeProgress('draft', { a: 1, b: 1 });
    patchScopeProgress('saved:x', { b: 0 });

    copyScopeProgress('draft', 'saved:x', false);
    expect(readScopeProgress('saved:x')).toEqual({ a: 1, b: 0 });
    expect(readScopeProgress('draft')).toEqual({ a: 1, b: 1 });

    copyScopeProgress('draft', 'saved:y', true);
    expect(readScopeProgress('saved:y')).toEqual({ a: 1, b: 1 });
    expect(hasScopeProgress('draft')).toBe(false);
  });

  it('starts over from storage that is corrupt or not its own, and survives storage that refuses writes', () => {
    localStorage.setItem(SHOPPING_PROGRESS_STORAGE_KEY, '{nope');
    expect(readScopeProgress('draft')).toEqual({});

    localStorage.setItem(SHOPPING_PROGRESS_STORAGE_KEY, JSON.stringify({ v: 2, scopes: { draft: { entries: { a: 1 } } } }));
    expect(readScopeProgress('draft')).toEqual({});

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(patchScopeProgress('draft', { a: 1 })).toEqual({ a: 1 });
  });
});
