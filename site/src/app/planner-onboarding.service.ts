import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface PlannerOnboardingState {
  completed: boolean;
  dismissed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PlannerOnboardingService {
  private readonly onboardingStateStorageKey = 'ddo-planner-onboarding-state-v1';
  private readonly legacyAffixTypeOpenedStorageKey = 'ddo-planner-onboarding-affix-type-opened';
  private readonly defaultState: PlannerOnboardingState = {
    completed: false,
    dismissed: false
  };
  private onboardingState = this.readOnboardingState();
  private onboardingStateSubject = new BehaviorSubject<PlannerOnboardingState>(this.onboardingState);

  getOnboardingState() {
    return this.onboardingStateSubject.asObservable();
  }

  shouldShowOnboarding() {
    return !this.onboardingState.completed && !this.onboardingState.dismissed;
  }

  completeIntro() {
    this.updateState({
      completed: true,
      dismissed: false
    });
  }

  dismissIntro() {
    this.updateState({
      completed: false,
      dismissed: true
    });
  }

  resetIntro() {
    try {
      localStorage.removeItem(this.onboardingStateStorageKey);
      localStorage.removeItem(this.legacyAffixTypeOpenedStorageKey);
    } catch {
      // The in-memory subject still resets the cue for this session.
    }

    this.updateOnboardingSubject({ ...this.defaultState });
  }

  private readOnboardingState(): PlannerOnboardingState {
    try {
      const storedState = localStorage.getItem(this.onboardingStateStorageKey);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        return {
          completed: parsedState.completed === true,
          dismissed: parsedState.dismissed === true
        };
      }

      if (localStorage.getItem(this.legacyAffixTypeOpenedStorageKey) === '1') {
        return {
          completed: true,
          dismissed: false
        };
      }
    } catch {
      return { ...this.defaultState };
    }

    return { ...this.defaultState };
  }

  private updateState(state: PlannerOnboardingState) {
    try {
      localStorage.setItem(this.onboardingStateStorageKey, JSON.stringify(state));
      localStorage.removeItem(this.legacyAffixTypeOpenedStorageKey);
    } catch {
      // The in-memory subject still updates the cue for this session.
    }

    this.updateOnboardingSubject(state);
  }

  private updateOnboardingSubject(state: PlannerOnboardingState) {
    this.onboardingState = state;
    setTimeout(() => this.onboardingStateSubject.next(state), 0);
  }
}
