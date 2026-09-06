import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * How the affix builder is presented:
 * - `setup`: full-screen, opaque, no shell behind it, with a "Start planning" primary
 *   action. Used the first time a visitor arrives with no build yet.
 * - `edit`: a slide-over panel over the planner shell. Used for every later edit.
 */
export type AffixBuilderMode = 'setup' | 'edit';

@Injectable({
  providedIn: 'root'
})
export class AffixBuilderDrawerService {
  private modeSubject = new BehaviorSubject<AffixBuilderMode | null>(null);

  readonly mode$ = this.modeSubject.asObservable();

  get isOpen(): boolean {
    return this.modeSubject.value !== null;
  }

  get mode(): AffixBuilderMode | null {
    return this.modeSubject.value;
  }

  open(mode: AffixBuilderMode = 'edit') {
    if (this.modeSubject.value !== mode) {
      this.modeSubject.next(mode);
    }
  }

  close() {
    if (this.modeSubject.value !== null) {
      this.modeSubject.next(null);
    }
  }
}
