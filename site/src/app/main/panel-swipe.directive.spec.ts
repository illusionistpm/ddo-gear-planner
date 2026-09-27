import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { EquippedService, PlannerTab } from '../planner/equipped.service';
import { PanelSwipeDirective } from './panel-swipe.directive';

@Component({
  template: `
    <div class="planner-page">
      <div class="planner-tab-panels" appPanelSwipe>
        <section class="planner-tab-panel" id="equipmentPanel" [hidden]="tab !== 'equipment'"></section>
        <section class="planner-tab-panel" id="affixesPanel" [hidden]="tab !== 'affixes'"></section>
      </div>
    </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
class HostComponent {
  tab: PlannerTab = 'equipment';
}

class EquippedStub {
  readonly tab$ = new BehaviorSubject<PlannerTab>('equipment');
  readonly setActiveMainTab = vi.fn((tab: PlannerTab) => this.tab$.next(tab));
  getActiveMainTab() {
    return this.tab$.asObservable();
  }
}

const WIDTH = 400;

describe('PanelSwipeDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let equipped: EquippedStub;
  let panels: HTMLElement;
  let equipmentPanel: HTMLElement;
  let affixesPanel: HTMLElement;
  let page: HTMLElement;
  let narrow: boolean;
  let pointerId = 0;
  let now = 0;

  beforeEach(() => {
    narrow = true;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === PanelSwipeDirective.NARROW_QUERY && narrow, media: query })
    });

    equipped = new EquippedStub();
    TestBed.configureTestingModule({
      declarations: [HostComponent, PanelSwipeDirective],
      providers: [{ provide: EquippedService, useValue: equipped }]
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    page = root.querySelector('.planner-page')!;
    panels = root.querySelector('.planner-tab-panels')!;
    equipmentPanel = root.querySelector('#equipmentPanel')!;
    affixesPanel = root.querySelector('#affixesPanel')!;
    Object.defineProperty(panels, 'clientWidth', { configurable: true, value: WIDTH });

    // The host follows the service, as MainComponent does.
    equipped.tab$.subscribe(tab => {
      fixture.componentInstance.tab = tab;
      fixture.detectChanges();
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  function pointer(type: string, x: number, y = 300, pointerType = 'touch', target: Element = equipmentPanel) {
    const event = new PointerEvent(type, {
      bubbles: true, pointerId, pointerType, isPrimary: true, clientX: x, clientY: y
    });
    // A frame apart, as a real finger's events are - jsdom stamps them all alike.
    now += 16;
    Object.defineProperty(event, 'timeStamp', { value: now });
    target.dispatchEvent(event);
  }

  /** A drag from startX through each of xs, without letting go. */
  function drag(startX: number, xs: number[], options: { y?: number[]; pointerType?: string; target?: Element } = {}) {
    pointerId++;
    const target = options.target ?? equipmentPanel;
    pointer('pointerdown', startX, 300, options.pointerType, target);
    xs.forEach((x, i) => pointer('pointermove', x, options.y?.[i] ?? 300, options.pointerType, target));
  }

  function release(x: number, options: { pointerType?: string; target?: Element } = {}) {
    pointer('pointerup', x, 300, options.pointerType, options.target ?? equipmentPanel);
  }

  const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const settled = () => new Promise<void>(resolve => setTimeout(resolve, PanelSwipeDirective.SETTLE_MS + 100));

  function expectAtRest() {
    expect(panels.classList.contains('swiping')).toBe(false);
    expect(panels.classList.contains('swipe-settling')).toBe(false);
    expect(equipmentPanel.classList.contains('swipe-peer')).toBe(false);
    expect(affixesPanel.classList.contains('swipe-peer')).toBe(false);
    expect(equipmentPanel.style.transform).toBe('');
    expect(affixesPanel.style.transform).toBe('');
    expect(page.classList.contains('planner-swiping')).toBe(false);
    expect(page.style.getPropertyValue('--planner-swipe-progress')).toBe('');
  }

  it('moves both panels with the finger and reveals the next one', async () => {
    drag(300, [280, 200]);
    await nextFrame();

    expect(panels.classList.contains('swiping')).toBe(true);
    expect(affixesPanel.classList.contains('swipe-peer')).toBe(true);
    expect(equipmentPanel.style.transform).toBe('translateX(-100px)');
    expect(affixesPanel.style.transform).toBe('translateX(calc(100% + -100px))');
    expect(page.classList.contains('planner-swiping')).toBe(true);
    expect(page.style.getPropertyValue('--planner-swipe-progress')).toBe('0.25');

    release(200);
    await settled();
  });

  it('switches to Tracked Affixes on a left swipe past the threshold', async () => {
    drag(300, [280, 140]);
    release(140);
    await settled();

    expect(equipped.setActiveMainTab).toHaveBeenCalledWith('affixes');
    expect(affixesPanel.hidden).toBe(false);
    expect(equipmentPanel.hidden).toBe(true);
    expectAtRest();
  });

  it('switches back to Equipment on a right swipe from Tracked Affixes', async () => {
    equipped.tab$.next('affixes');
    drag(100, [120, 260], { target: affixesPanel });
    release(260, { target: affixesPanel });
    await settled();

    expect(equipped.setActiveMainTab).toHaveBeenCalledWith('equipment');
    expect(equipmentPanel.hidden).toBe(false);
    expectAtRest();
  });

  it('snaps back when the drag is short and not a flick', async () => {
    // Out to -50, then drifting back: the last movement opposes the drag.
    drag(300, [280, 250, 280]);
    release(280);
    await settled();

    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
    expect(equipmentPanel.hidden).toBe(false);
    expectAtRest();
  });

  it('switches on a short flick', async () => {
    drag(300, [290, 260]);
    release(260);
    await settled();

    expect(equipped.setActiveMainTab).toHaveBeenCalledWith('affixes');
    expectAtRest();
  });

  it('has nowhere to go past the last view', async () => {
    equipped.tab$.next('affixes');
    drag(300, [280, 100], { target: affixesPanel });
    await nextFrame();

    expect(equipmentPanel.classList.contains('swipe-peer')).toBe(false);
    // Resisted: a third of the finger's travel.
    expect(affixesPanel.style.transform).toBe('translateX(-60px)');

    release(100, { target: affixesPanel });
    await settled();
    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
    expectAtRest();
  });

  it('ignores a mouse', async () => {
    drag(300, [280, 100], { pointerType: 'mouse' });
    release(100, { pointerType: 'mouse' });
    await settled();

    expect(panels.classList.contains('swiping')).toBe(false);
    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
  });

  it('does nothing when both panels are on screen', async () => {
    narrow = false;
    drag(300, [280, 100]);
    release(100);
    await settled();

    expect(panels.classList.contains('swiping')).toBe(false);
    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
  });

  it('leaves a drag from the screen edge to the OS back gesture', async () => {
    drag(5, [40, 250]);
    release(250);
    await settled();

    expect(panels.classList.contains('swiping')).toBe(false);
    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
  });

  it('leaves a mostly vertical drag to the browser', async () => {
    drag(300, [290, 100], { y: [270, 100] });
    release(100);
    await settled();

    expect(panels.classList.contains('swiping')).toBe(false);
    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
  });

  it('puts everything back when the browser cancels the drag', async () => {
    drag(300, [280, 100]);
    pointer('pointercancel', 100);
    await settled();

    expect(equipped.setActiveMainTab).not.toHaveBeenCalled();
    expectAtRest();
  });
});
