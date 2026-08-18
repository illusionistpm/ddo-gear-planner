import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PlannerOnboardingService {
  private readonly affixTypeOpenedStorageKey = 'ddo-planner-onboarding-affix-type-opened';
  private affixTypeOpenedSubject = new BehaviorSubject<boolean>(this.readAffixTypeOpened());

  getAffixTypeOpened() {
    return this.affixTypeOpenedSubject.asObservable();
  }

  hasOpenedAffixType() {
    return this.affixTypeOpenedSubject.value;
  }

  markAffixTypeOpened() {
    if (this.affixTypeOpenedSubject.value) {
      return;
    }

    this.writeAffixTypeOpened();
    this.affixTypeOpenedSubject.next(true);
  }

  resetAffixTypeOpened() {
    if (!this.affixTypeOpenedSubject.value) {
      return;
    }

    this.clearAffixTypeOpened();
    this.affixTypeOpenedSubject.next(false);
  }

  private readAffixTypeOpened() {
    try {
      return localStorage.getItem(this.affixTypeOpenedStorageKey) === '1';
    } catch {
      return false;
    }
  }

  private writeAffixTypeOpened() {
    try {
      localStorage.setItem(this.affixTypeOpenedStorageKey, '1');
    } catch {
      // The in-memory subject still completes the cue for this session.
    }
  }

  private clearAffixTypeOpened() {
    try {
      localStorage.removeItem(this.affixTypeOpenedStorageKey);
    } catch {
      // The in-memory subject still resets the cue for this session.
    }
  }
}
