import { BehaviorSubject } from 'rxjs';

import type { EquippedService } from './equipped.service';
import type { Item } from '../gear/item';
import { PlannerOnboardingService } from './planner-onboarding.service';

// Just the slice of EquippedService the link bypass reads: one slot.
class FakeEquipped {
  readonly armor = new BehaviorSubject<Item | null>(null);
  getSlots() {
    return new Map([['Armor', this.armor.asObservable()]]);
  }
  isBuildEmpty() {
    return this.armor.value === null;
  }
}

describe('PlannerOnboardingService', () => {
  const stateKey = 'ddo-planner-onboarding-state-v1';
  const legacyKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(() => {
    localStorage.removeItem(stateKey);
    localStorage.removeItem(legacyKey);
  });

  afterEach(() => {
    localStorage.removeItem(stateKey);
    localStorage.removeItem(legacyKey);
  });

  let equipped: FakeEquipped;

  beforeEach(() => {
    equipped = new FakeEquipped();
  });

  // A fresh instance each call: several specs check what a reload would read
  // back from storage.
  function newService() {
    return new PlannerOnboardingService(equipped as unknown as EquippedService);
  }

  function equipArmor() {
    equipped.armor.next({ name: 'Armor' } as Item);
  }

  function clearArmor() {
    equipped.armor.next(null);
  }

  describe('after a followed build link', () => {
    it('stays out of the way while the build has gear', () => {
      const service = newService();
      equipArmor();

      service.bypassForBuildLink();

      expect(service.shouldShowOnboarding()).toBe(false);
    });

    it('is not bypassed by a link with no gear in it', () => {
      const service = newService();

      service.bypassForBuildLink();

      expect(service.shouldShowOnboarding()).toBe(true);
    });

    it('comes back for good once the build has no gear, and tells subscribers', () => {
      const service = newService();
      equipArmor();
      service.bypassForBuildLink();
      const emissions: unknown[] = [];
      const subscription = service.getOnboardingState().subscribe(state => emissions.push(state));
      emissions.length = 0;

      clearArmor();

      expect(service.shouldShowOnboarding()).toBe(true);
      expect(emissions.length).toBe(1);

      // Latched: equipping again isn't a followed link.
      equipArmor();
      expect(service.shouldShowOnboarding()).toBe(true);
      subscription.unsubscribe();
    });

    it('does not override a completed or dismissed intro once it ends', () => {
      const service = newService();
      equipArmor();
      service.dismissIntro();
      service.bypassForBuildLink();

      clearArmor();

      expect(service.shouldShowOnboarding()).toBe(false);
    });
  });

  it('starts onboarding when no completion or dismissal has been stored', () => {
    const service = newService();

    expect(service.shouldShowOnboarding()).toBe(true);
  });

  it('persists completed onboarding in localStorage', () => {
    const service = newService();

    service.completeIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
    expect(JSON.parse(localStorage.getItem(stateKey) || '{}')).toEqual({
      completed: true,
      dismissed: false
    });
    expect(newService().shouldShowOnboarding()).toBe(false);
  });

  it('persists dismissed onboarding in localStorage', () => {
    const service = newService();

    service.dismissIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
    expect(JSON.parse(localStorage.getItem(stateKey) || '{}')).toEqual({
      completed: false,
      dismissed: true
    });
    expect(newService().shouldShowOnboarding()).toBe(false);
  });

  it('treats the old affix-type flag as completed onboarding', () => {
    localStorage.setItem(legacyKey, '1');

    expect(newService().shouldShowOnboarding()).toBe(false);
  });

  it('resets completed and legacy onboarding state', () => {
    localStorage.setItem(stateKey, JSON.stringify({
      completed: true,
      dismissed: false
    }));
    localStorage.setItem(legacyKey, '1');
    const service = newService();

    service.resetIntro();

    expect(service.shouldShowOnboarding()).toBe(true);
    expect(localStorage.getItem(stateKey)).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('updates the in-memory state when localStorage writes fail', () => {
    const service = newService();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    service.dismissIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
  });
});
