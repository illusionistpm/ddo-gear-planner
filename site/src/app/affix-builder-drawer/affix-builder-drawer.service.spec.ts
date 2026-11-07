import { AffixBuilderDrawerService } from './affix-builder-drawer.service';

describe('AffixBuilderDrawerService', () => {
  let service: AffixBuilderDrawerService;

  beforeEach(() => {
    service = new AffixBuilderDrawerService();
  });

  it('starts closed', () => {
    expect(service.isOpen).toBe(false);
  });

  it('opens and closes', () => {
    service.open();
    expect(service.isOpen).toBe(true);

    service.close();
    expect(service.isOpen).toBe(false);
  });

  it('emits only real changes to subscribers', () => {
    const seen: boolean[] = [];
    const sub = service.isOpen$.subscribe(value => seen.push(value));

    service.open();
    service.open();
    service.close();
    service.close();

    expect(seen).toEqual([false, true, false]);
    sub.unsubscribe();
  });
});
