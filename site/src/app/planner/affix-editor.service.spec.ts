import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { AffixEditorService } from './affix-editor.service';
import { EquippedService, PlannerTab } from './equipped.service';
import { AnalyticsService } from '../shared/analytics.service';

describe('AffixEditorService', () => {
  let service: AffixEditorService;
  let tab: BehaviorSubject<PlannerTab>;
  let oneViewAtATime: boolean;

  beforeEach(() => {
    tab = new BehaviorSubject<PlannerTab>('affixes');
    oneViewAtATime = false;
    // jsdom has no matchMedia: stand one in that answers the breakpoint as told.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: oneViewAtATime }) as MediaQueryList
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: EquippedService,
          useValue: {
            getActiveMainTab: () => tab.asObservable(),
            setActiveMainTab: (next: PlannerTab) => tab.next(next)
          }
        },
        { provide: AnalyticsService, useValue: { track: vi.fn() } }
      ]
    });
    service = TestBed.inject(AffixEditorService);
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('starts closed', () => {
    expect(service.isOpen).toBe(false);
  });

  it('opens and closes, emitting only real changes', () => {
    const seen: boolean[] = [];
    const sub = service.isOpen$.subscribe(value => seen.push(value));

    service.open();
    service.open();
    service.close();
    service.close();

    expect(seen).toEqual([false, true, false]);
    sub.unsubscribe();
  });

  it('reveals it on the Affixes view, open, and asks for it to be scrolled to', () => {
    tab.next('equipment');
    let reveals = 0;
    const sub = service.revealRequests$.subscribe(() => reveals++);

    service.reveal('toolbar');

    expect(tab.value).toBe('affixes');
    expect(service.isOpen).toBe(true);
    expect(reveals).toBe(1);
    sub.unsubscribe();
  });

  it('finishes in place side by side, where the gear is already on screen', () => {
    service.open();

    service.finish();

    expect(service.isOpen).toBe(false);
    expect(tab.value).toBe('affixes');
  });

  it('finishes on the gear one view at a time', () => {
    oneViewAtATime = true;
    service.open();

    service.finish();

    expect(service.isOpen).toBe(false);
    expect(tab.value).toBe('equipment');
  });

  it('closes when the Affixes view is left one view at a time, but not side by side', () => {
    service.open();
    tab.next('equipment');
    expect(service.isOpen).toBe(true);

    tab.next('affixes');
    oneViewAtATime = true;
    tab.next('equipment');
    expect(service.isOpen).toBe(false);
  });
});
