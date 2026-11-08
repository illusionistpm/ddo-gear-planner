import { TestBed } from '@angular/core/testing';

import { AffixEditorService } from './affix-editor.service';
import { EquippedService } from './equipped.service';
import { AnalyticsService } from '../shared/analytics.service';

describe('AffixEditorService', () => {
  let service: AffixEditorService;
  let equipped: { setActiveMainTab: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    equipped = { setActiveMainTab: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: EquippedService, useValue: equipped },
        { provide: AnalyticsService, useValue: { track: vi.fn() } }
      ]
    });
    service = TestBed.inject(AffixEditorService);
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
    const reveals: void[] = [];
    const sub = service.revealRequests$.subscribe(() => reveals.push(undefined));

    service.reveal('toolbar');

    expect(equipped.setActiveMainTab).toHaveBeenCalledWith('affixes');
    expect(service.isOpen).toBe(true);
    expect(reveals.length).toBe(1);
    sub.unsubscribe();
  });
});
