import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import { CurrentBuildService, CurrentBuildState } from '../../build/current-build.service';
import type { ShoppingProgress, ShoppingProgressPatch, ShoppingSourcePicks } from './shopping-list-types';
import {
  clearScopePicks, copyScopeProgress, hasScopeProgress, patchScopeProgress, readScopePicks, readScopeProgress, setScopePick,
  SHOPPING_PROGRESS_STORAGE_KEY
} from './shopping-progress-storage';

/**
 * Which build's ticks are in play: a saved build of yours by its id, anyone
 * else's by its short id, and an unsaved build as the one draft.
 */
export function shoppingProgressScope(state: CurrentBuildState): string {
  if (state.savedBuildId && state.ownership === 'owned') {
    return `saved:${state.savedBuildId}`;
  }
  return state.shortId ? `build:${state.shortId}` : SHOPPING_DRAFT_SCOPE;
}

export const SHOPPING_DRAFT_SCOPE = 'draft';

/** Holds the current build's shopping-list ticks, and the quests picked to get things from. */
@Injectable({ providedIn: 'root', useFactory: () => inject(LocalShoppingProgressStore) })
export abstract class ShoppingProgressStore {
  abstract readonly progress$: Observable<ShoppingProgress>;
  abstract readonly picks$: Observable<ShoppingSourcePicks>;
  abstract get progress(): ShoppingProgress;
  abstract get picks(): ShoppingSourcePicks;
  abstract get scope(): string;
  abstract applyPatch(patch: ShoppingProgressPatch): void;
  /** Sets the quests to get a thing from, or forgets the pick (null) so the list chooses. */
  abstract setPick(identity: string, quests: readonly string[] | null): void;
  /** Forgets every pick, so the list chooses where to get everything. */
  abstract clearPicks(): void;
}

/**
 * Keeps ticks and picks in this browser's storage. When a build becomes a
 * saved build of yours - saving a draft, saving a copy, or confirming a
 * loaded build is yours - those made so far come along, so nothing is lost
 * by saving.
 */
@Injectable({ providedIn: 'root' })
export class LocalShoppingProgressStore extends ShoppingProgressStore implements OnDestroy {
  private readonly progressSubject: BehaviorSubject<ShoppingProgress>;
  private readonly picksSubject: BehaviorSubject<ShoppingSourcePicks>;
  readonly progress$: Observable<ShoppingProgress>;
  readonly picks$: Observable<ShoppingSourcePicks>;
  private currentScope: string;
  private readonly subscription: Subscription;
  private readonly onStorage = (event: StorageEvent) => {
    if (event.key === SHOPPING_PROGRESS_STORAGE_KEY || event.key === null) {
      this.readScope();
    }
  };

  constructor(currentBuild: CurrentBuildService) {
    super();
    this.currentScope = shoppingProgressScope(currentBuild.value);
    this.progressSubject = new BehaviorSubject(readScopeProgress(this.currentScope));
    this.picksSubject = new BehaviorSubject(readScopePicks(this.currentScope));
    this.progress$ = this.progressSubject.asObservable();
    this.picks$ = this.picksSubject.asObservable();
    this.subscription = currentBuild.state$.subscribe(state => this.changeScope(shoppingProgressScope(state)));
    window.addEventListener('storage', this.onStorage);
  }

  get progress(): ShoppingProgress {
    return this.progressSubject.value;
  }

  get picks(): ShoppingSourcePicks {
    return this.picksSubject.value;
  }

  get scope(): string {
    return this.currentScope;
  }

  applyPatch(patch: ShoppingProgressPatch): void {
    if (Object.keys(patch).length) {
      this.progressSubject.next(patchScopeProgress(this.currentScope, patch));
    }
  }

  setPick(identity: string, quests: readonly string[] | null): void {
    this.picksSubject.next(setScopePick(this.currentScope, identity, quests));
  }

  clearPicks(): void {
    clearScopePicks(this.currentScope);
    this.picksSubject.next({});
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    window.removeEventListener('storage', this.onStorage);
  }

  private changeScope(scope: string): void {
    if (scope === this.currentScope) {
      return;
    }
    const previous = this.currentScope;
    this.currentScope = scope;
    // A build just became one of your saved builds: bring its ticks along,
    // unless that saved build already has its own. A saved draft is no longer
    // a draft, so its ticks move rather than copy.
    if (scope.startsWith('saved:') && !hasScopeProgress(scope)) {
      copyScopeProgress(previous, scope, previous === SHOPPING_DRAFT_SCOPE);
    }
    this.readScope();
  }

  private readScope(): void {
    this.progressSubject.next(readScopeProgress(this.currentScope));
    this.picksSubject.next(readScopePicks(this.currentScope));
  }
}
