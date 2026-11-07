import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Where the affix builder was opened from, for analytics: the toolbar button,
 * or one of the "choose affixes" prompts a build with nothing tracked shows.
 */
export type AffixBuilderOpenSource = 'toolbar' | 'empty_state' | 'equipment_callout';

/** The affix builder: a slide-over panel over the planner. */
@Injectable({
  providedIn: 'root'
})
export class AffixBuilderDrawerService {
  private openSubject = new BehaviorSubject<boolean>(false);

  readonly isOpen$ = this.openSubject.asObservable();

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  open() {
    if (!this.openSubject.value) {
      this.openSubject.next(true);
    }
  }

  close() {
    if (this.openSubject.value) {
      this.openSubject.next(false);
    }
  }
}
