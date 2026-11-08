import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from './equipped.service';

/** What asked for the affix editor, for analytics. */
export type AffixEditorRevealSource = 'toolbar' | 'start_banner';

/**
 * Whether the affix editor - the top of the Tracked Affixes panel - is open.
 * Session state only: never stored, never in the URL (it's how you're
 * looking at a build, not part of it).
 */
/** Below this the planner shows one view at a time (the layout breakpoints in styles.css). */
const ONE_VIEW_AT_A_TIME = '(max-width: 994.98px)';

function isOneViewAtATime(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(ONE_VIEW_AT_A_TIME)?.matches;
}

@Injectable({
  providedIn: 'root'
})
export class AffixEditorService implements OnDestroy {
  private openSubject = new BehaviorSubject<boolean>(false);
  private revealSubject = new Subject<void>();
  private tabSubscription: Subscription;

  readonly isOpen$ = this.openSubject.asObservable();
  /** Fires when the editor should be scrolled to and focused - see reveal(). */
  readonly revealRequests$: Observable<void> = this.revealSubject.asObservable();

  constructor(
    private equipped: EquippedService,
    private analytics: AnalyticsService
  ) {
    // One view at a time, the editor is only open where it can be seen:
    // leaving the Affixes view is leaving the editor, so the toolbar
    // button's open state never describes something off screen.
    this.tabSubscription = equipped.getActiveMainTab().subscribe(tab => {
      if (tab !== 'affixes' && isOneViewAtATime()) {
        this.close();
      }
    });
  }

  ngOnDestroy() {
    this.tabSubscription.unsubscribe();
  }

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  /** Open it where it is, without moving the page - for a fresh build's first view. */
  open() {
    if (!this.openSubject.value) {
      this.openSubject.next(true);
    }
  }

  /**
   * Take the user to it: the Affixes view (a no-op side by side, where it's
   * already on screen), open, scrolled into view and focused.
   */
  reveal(source: AffixEditorRevealSource) {
    this.analytics.track('open_affix_editor', { source });
    this.equipped.setActiveMainTab('affixes');
    this.open();
    this.revealSubject.next();
  }

  /**
   * Done editing: close it, and one view at a time, go to the gear - the
   * point of finishing. Side by side the gear is already on screen.
   */
  finish() {
    this.close();
    if (isOneViewAtATime()) {
      this.equipped.setActiveMainTab('equipment');
    }
  }

  close() {
    if (this.openSubject.value) {
      this.openSubject.next(false);
    }
  }
}
