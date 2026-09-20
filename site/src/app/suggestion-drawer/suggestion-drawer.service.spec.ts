import { SuggestionDrawerService } from './suggestion-drawer.service';

describe('SuggestionDrawerService', () => {
  let service: SuggestionDrawerService;

  beforeEach(() => {
    service = new SuggestionDrawerService();
  });

  it('has no back history for a fresh open', () => {
    service.openBonusType('Fortitude Save', 'Artifact', true);

    expect(service.canGoBack).toBe(false);
  });

  it('remembers the previous view when drilling deeper while open', () => {
    service.openBonusType('Fortitude Save', 'Artifact', true);
    service.openSet('Anteus Set');

    expect(service.canGoBack).toBe(true);
    expect(service.currentState).toEqual({ kind: 'set', setName: 'Anteus Set' });

    service.back();

    expect(service.currentState).toEqual({
      kind: 'bonusType', affixName: 'Fortitude Save', bonusType: 'Artifact', sortOwnedToTop: true,
    });
    expect(service.canGoBack).toBe(false);
  });

  it('clears history on close and back past the start closes the drawer', () => {
    service.openBonusType('Strength', 'Profane', false);
    service.openSet('Some Set');
    service.close();

    expect(service.currentState).toBeNull();
    expect(service.canGoBack).toBe(false);

    service.back();
    expect(service.currentState).toBeNull();
  });
});
