import { Location } from '@angular/common';
import { Injectable, OnDestroy, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

/** What an edit's history entry carries, beside the router's own state. */
interface EditStamp {
  /** One run of consecutive edits; a new one starts wherever an edit follows an unstamped entry. */
  chain: string;
  /** How many edits this entry is past the run's first entry (0). */
  index: number;
}

const STAMP_KEY = 'plannerEdit';

function stampOf(state: unknown): EditStamp | null {
  const stamp = (state as Record<string, unknown> | null)?.[STAMP_KEY] as EditStamp | undefined;
  return stamp && typeof stamp.chain === 'string' && typeof stamp.index === 'number' ? stamp : null;
}

let chainCounter = 0;

/**
 * Undo and redo for the planner's edits, as steps through browser history.
 * Every gear edit already pushes a history entry (QueryParamsService), so
 * Back has always been "undo the last edit"; this lets Ctrl+Z and Ctrl+Y do
 * the same without ever stepping off the planner onto some other page.
 *
 * Each edit's entry is stamped with its place in a run of edits: entry k was
 * pushed from entry k - 1, directly behind it, so undo is safe from any
 * index above 0. Redo needs to know an edit lies ahead, which history can't
 * say, so the furthest index reached in the current run is remembered here -
 * in memory only, so a reload forgets it, which just means no redo.
 */
@Injectable({ providedIn: 'root' })
export class EditHistoryService implements OnDestroy {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  /** The current run's furthest entry still in history. */
  private top: EditStamp | null = null;
  /** The stamp of the entry the last navigation left, for a push that cuts history short. */
  private lastStamp: EditStamp | null = null;
  private readonly subscription: Subscription;

  constructor() {
    this.lastStamp = this.currentStamp();
    this.subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.onNavigated());
    // Back and forward move through history whether or not the router makes
    // a navigation of it (it skips one to a URL it's already on).
    this.subscription.add(this.location.subscribe(() => this.lastStamp = this.currentStamp()));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /**
   * The state for an edit's navigation: a push gets the next index in the
   * run (stamping the entry it leaves as a run's start if it isn't in one),
   * and a replace keeps the entry's stamp, which the router would otherwise drop.
   */
  stateForNavigation(replaceUrl: boolean): Record<string, unknown> | undefined {
    let current = this.currentStamp();
    if (replaceUrl) {
      return current ? { [STAMP_KEY]: current } : undefined;
    }
    if (!current) {
      current = { chain: `${Date.now().toString(36)}-${++chainCounter}`, index: 0 };
      const state = (this.location.getState() as Record<string, unknown> | null) ?? {};
      this.location.replaceState(this.location.path(true), '', { ...state, [STAMP_KEY]: current });
      this.lastStamp = current;
    }
    return { [STAMP_KEY]: { chain: current.chain, index: current.index + 1 } };
  }

  get canUndo(): boolean {
    return (this.currentStamp()?.index ?? 0) > 0;
  }

  get canRedo(): boolean {
    const current = this.currentStamp();
    return !!current && !!this.top && this.top.chain === current.chain && this.top.index > current.index;
  }

  /** Returns whether there was an edit to undo. */
  undo(): boolean {
    if (!this.canUndo) {
      return false;
    }
    this.location.back();
    return true;
  }

  /** Returns whether there was an undone edit to redo. */
  redo(): boolean {
    if (!this.canRedo) {
      return false;
    }
    this.location.forward();
    return true;
  }

  private currentStamp(): EditStamp | null {
    return stampOf(this.location.getState());
  }

  private onNavigated(): void {
    const stamp = this.currentStamp();
    const navigation = this.router.lastSuccessfulNavigation();
    const pushed = !!navigation && navigation.trigger !== 'popstate' && !navigation.extras.replaceUrl;
    if (pushed) {
      if (stamp) {
        // An edit: whatever lay ahead of the entry it left is gone.
        this.top = stamp;
      } else if (this.lastStamp && this.top?.chain === this.lastStamp.chain) {
        // Some other page or view: history ahead of where it left is gone too.
        this.top = this.lastStamp;
      }
    }
    this.lastStamp = stamp;
  }
}
