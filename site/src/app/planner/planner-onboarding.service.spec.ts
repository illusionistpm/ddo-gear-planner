import { PlannerOnboardingService } from './planner-onboarding.service';

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

  it('starts onboarding when no completion or dismissal has been stored', () => {
    const service = new PlannerOnboardingService();

    expect(service.shouldShowOnboarding()).toBe(true);
  });

  it('persists completed onboarding in localStorage', () => {
    const service = new PlannerOnboardingService();

    service.completeIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
    expect(JSON.parse(localStorage.getItem(stateKey) || '{}')).toEqual({
      completed: true,
      dismissed: false
    });
    expect(new PlannerOnboardingService().shouldShowOnboarding()).toBe(false);
  });

  it('persists dismissed onboarding in localStorage', () => {
    const service = new PlannerOnboardingService();

    service.dismissIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
    expect(JSON.parse(localStorage.getItem(stateKey) || '{}')).toEqual({
      completed: false,
      dismissed: true
    });
    expect(new PlannerOnboardingService().shouldShowOnboarding()).toBe(false);
  });

  it('treats the old affix-type flag as completed onboarding', () => {
    localStorage.setItem(legacyKey, '1');

    expect(new PlannerOnboardingService().shouldShowOnboarding()).toBe(false);
  });

  it('resets completed and legacy onboarding state', () => {
    localStorage.setItem(stateKey, JSON.stringify({
      completed: true,
      dismissed: false
    }));
    localStorage.setItem(legacyKey, '1');
    const service = new PlannerOnboardingService();

    service.resetIntro();

    expect(service.shouldShowOnboarding()).toBe(true);
    expect(localStorage.getItem(stateKey)).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it('updates the in-memory state when localStorage writes fail', () => {
    const service = new PlannerOnboardingService();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    service.dismissIntro();

    expect(service.shouldShowOnboarding()).toBe(false);
  });
});
