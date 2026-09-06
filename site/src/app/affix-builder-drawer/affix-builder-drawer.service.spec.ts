import { AffixBuilderDrawerService } from './affix-builder-drawer.service';

describe('AffixBuilderDrawerService', () => {
  let service: AffixBuilderDrawerService;

  beforeEach(() => {
    service = new AffixBuilderDrawerService();
  });

  it('starts closed', () => {
    expect(service.isOpen).toBeFalse();
    expect(service.mode).toBeNull();
  });

  it('opens in edit mode by default and closes', () => {
    service.open();
    expect(service.isOpen).toBeTrue();
    expect(service.mode).toBe('edit');

    service.close();
    expect(service.isOpen).toBeFalse();
    expect(service.mode).toBeNull();
  });

  it('opens in setup mode when asked', () => {
    service.open('setup');
    expect(service.mode).toBe('setup');
  });

  it('emits mode changes to subscribers', () => {
    const seen: (string | null)[] = [];
    const sub = service.mode$.subscribe(value => seen.push(value));

    service.open('setup');
    service.open('setup');
    service.open('edit');
    service.close();

    expect(seen).toEqual([null, 'setup', 'edit', null]);
    sub.unsubscribe();
  });
});
