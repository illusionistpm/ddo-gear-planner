import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { EquippedService } from './equipped.service';

/** What asked for the affix editor, for analytics. */
export type AffixEditorRevealSource = 'toolbar' | 'start_banner';

/**
 * Whether the affix editor - the top of the Tracked Affixes panel - is open.
 * Session state only: never stored, never in the URL (it's how you're
 * looking at a build, not part of it).
 */
@Injectable({
  providedIn: 'root'
})
export class AffixEditorService {
  private openSubject = new BehaviorSubject<boolean>(false);
  private revealSubject = new Subject<void>();

  readonly isOpen$ = this.openSubject.asObservable();
  /** Fires when the editor should be scrolled to and focused - see reveal(). */
  readonly revealRequests$: Observable<void> = this.revealSubject.asObservable();

  constructor(
    private equipped: EquippedService,
    private analytics: AnalyticsService
  ) { }

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

  close() {
    if (this.openSubject.value) {
      this.openSubject.next(false);
    }
  }
}
