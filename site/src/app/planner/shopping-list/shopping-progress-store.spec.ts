import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { CurrentBuildService, CurrentBuildState } from '../../build/current-build.service';
import { LocalShoppingProgressStore, shoppingProgressScope, ShoppingProgressStore } from './shopping-progress-store';
import { patchScopeProgress, readScopeProgress, SHOPPING_PROGRESS_STORAGE_KEY } from './shopping-progress-storage';

const UNSAVED: CurrentBuildState = { savedBuildId: null, shortId: null, name: null, isDirty: false, ownership: 'other' };

describe('shoppingProgressScope', () => {
  it('is a saved build of yours by id, anyone else\'s by short id, and otherwise the draft', () => {
    expect(shoppingProgressScope({ ...UNSAVED, savedBuildId: 'b1', shortId: 's1', ownership: 'owned' })).toBe('saved:b1');
    expect(shoppingProgressScope({ ...UNSAVED, shortId: 's1', ownership: 'other' })).toBe('build:s1');
    expect(shoppingProgressScope({ ...UNSAVED, shortId: 's1', ownership: 'unknown' })).toBe('build:s1');
    expect(shoppingProgressScope(UNSAVED)).toBe('draft');
  });
});

describe('LocalShoppingProgressStore', () => {
  let state: BehaviorSubject<CurrentBuildState>;
  let store: ShoppingProgressStore;

  beforeEach(() => {
    localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY);
    state = new BehaviorSubject(UNSAVED);
    TestBed.configureTestingModule({
      providers: [{ provide: CurrentBuildService, useValue: { state$: state, get value() { return state.value; } } }]
    });
    store = TestBed.inject(ShoppingProgressStore);
  });

  afterEach(() => localStorage.removeItem(SHOPPING_PROGRESS_STORAGE_KEY));

  it('is the local store by default', () => {
    expect(store).toBe(TestBed.inject(LocalShoppingProgressStore));
  });

  it('stores ticks for the current build and swaps them when the build changes', () => {
    const seen: object[] = [];
    store.progress$.subscribe(progress => seen.push(progress));

    store.applyPatch({ a: 1 });
    state.next({ ...UNSAVED, shortId: 'other', ownership: 'other' });
    store.applyPatch({ b: 1 });
    state.next(UNSAVED);

    expect(seen).toEqual([{}, { a: 1 }, {}, { b: 1 }, { a: 1 }]);
    expect(readScopeProgress('build:other')).toEqual({ b: 1 });
  });

  it('moves a draft\'s ticks into the build it is saved as', () => {
    store.applyPatch({ a: 1 });
    state.next({ ...UNSAVED, savedBuildId: 'b1', shortId: 's1', ownership: 'owned' });

    expect(store.progress).toEqual({ a: 1 });
    expect(store.scope).toBe('saved:b1');
    expect(readScopeProgress('draft')).toEqual({});
  });

  it('copies ticks made on someone else\'s build into your saved copy, leaving theirs', () => {
    state.next({ ...UNSAVED, shortId: 'theirs', ownership: 'other' });
    store.applyPatch({ a: 1 });
    state.next({ ...UNSAVED, savedBuildId: 'mine', shortId: 'mine-short', ownership: 'owned' });

    expect(store.progress).toEqual({ a: 1 });
    expect(readScopeProgress('build:theirs')).toEqual({ a: 1 });
  });

  it('brings ticks made before a loaded build was confirmed yours', () => {
    state.next({ ...UNSAVED, shortId: 's1', ownership: 'unknown' });
    store.applyPatch({ a: 0 });
    state.next({ ...UNSAVED, savedBuildId: 'b1', shortId: 's1', ownership: 'owned' });

    expect(store.progress).toEqual({ a: 0 });
  });

  it('leaves a saved build\'s own ticks alone', () => {
    patchScopeProgress('saved:b1', { kept: 1 });
    store.applyPatch({ a: 1 });
    state.next({ ...UNSAVED, savedBuildId: 'b1', shortId: 's1', ownership: 'owned' });

    expect(store.progress).toEqual({ kept: 1 });
    expect(readScopeProgress('draft')).toEqual({ a: 1 });
  });

  it('picks up ticks another tab made', () => {
    patchScopeProgress('draft', { fromElsewhere: 1 });
    window.dispatchEvent(new StorageEvent('storage', { key: SHOPPING_PROGRESS_STORAGE_KEY }));

    expect(store.progress).toEqual({ fromElsewhere: 1 });
  });

  it('ignores an empty patch', () => {
    const seen: object[] = [];
    store.progress$.subscribe(progress => seen.push(progress));
    store.applyPatch({});

    expect(seen.length).toBe(1);
  });
});
