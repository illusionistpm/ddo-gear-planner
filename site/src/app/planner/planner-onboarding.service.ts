import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription, merge } from 'rxjs';

import { EquippedService } from './equipped.service';

export interface PlannerOnboardingState {
  completed: boolean;
  dismissed: boolean;
  /**
   * The intro was just finished, and its closing "you're all set" message
   * hasn't been dismissed yet. Stored, so it survives the sign-in redirect it
   * offers. Only ever set by finishing the intro: skipping it doesn't, and
   * nobody who finished before the message existed gets it.
   */
  wrapUpPending: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PlannerOnboardingService implements OnDestroy {
  private readonly onboardingStateStorageKey = 'ddo-planner-onboarding-state-v1';
  private readonly legacyAffixTypeOpenedStorageKey = 'ddo-planner-onboarding-affix-type-opened';
  private readonly defaultState: PlannerOnboardingState = {
    completed: false,
    dismissed: false,
    wrapUpPending: false
  };
  private onboardingState = this.readOnboardingState();
  private onboardingStateSubject = new BehaviorSubject<PlannerOnboardingState>(this.onboardingState);

  // Someone who followed a build link (long ?b= or short /build/:shortId)
  // came to look at that build, not to be walked through starting one - so
  // the intro stays out of the way while it has gear. Session-only, never
  // stored: it latches off the first time the build has no gear at all
  // (they cleared it, or started a new build), from which point the intro
  // behaves exactly as it would for anyone else.
  private bypassedForBuildLink = false;
  private readonly slotsSubscription: Subscription;

  constructor(private readonly equipped: EquippedService) {
    this.slotsSubscription = merge(...equipped.getSlots().values()).subscribe(() => {
      if (this.bypassedForBuildLink && this.equipped.isBuildEmpty()) {
        this.bypassedForBuildLink = false;
        this.onboardingStateSubject.next(this.onboardingState);
      }
    });
  }

  ngOnDestroy() {
    this.slotsSubscription.unsubscribe();
  }

  getOnboardingState() {
    return this.onboardingStateSubject.asObservable();
  }

  shouldShowOnboarding() {
    return !this.onboardingState.completed && !this.onboardingState.dismissed && !this.bypassedForBuildLink;
  }

  /**
   * Call once a followed build link's params have been applied. A no-op
   * when that build has no gear - there is nothing to look at, so the intro
   * is as useful there as on a blank page.
   */
  bypassForBuildLink() {
    if (this.bypassedForBuildLink || this.equipped.isBuildEmpty()) {
      return;
    }
    this.bypassedForBuildLink = true;
    // Synchronous, unlike updateOnboardingSubject: both callers run outside
    // change detection (a router event, an HTTP callback), and the build's
    // gear is already on screen by the next render - a deferred emission
    // would let the intro's hints flash over it for a frame.
    this.onboardingStateSubject.next(this.onboardingState);
  }

  completeIntro() {
    this.updateState({
      completed: true,
      dismissed: false,
      wrapUpPending: true
    });
  }

  dismissIntro() {
    this.updateState({
      completed: false,
      dismissed: true,
      wrapUpPending: false
    });
  }

  shouldShowWrapUp() {
    return this.onboardingState.wrapUpPending;
  }

  dismissWrapUp() {
    if (this.onboardingState.wrapUpPending) {
      this.updateState({ ...this.onboardingState, wrapUpPending: false });
    }
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
          dismissed: parsedState.dismissed === true,
          wrapUpPending: parsedState.wrapUpPending === true
        };
      }

      if (localStorage.getItem(this.legacyAffixTypeOpenedStorageKey) === '1') {
        return {
          completed: true,
          dismissed: false,
          wrapUpPending: false
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
