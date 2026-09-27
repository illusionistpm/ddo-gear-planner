import { Directive, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService, PlannerTab } from '../planner/equipped.service';

/**
 * Swipes between the planner's views on a narrow screen, with the panels
 * following the finger.
 *
 * Sits on .planner-tab-panels, whose .planner-tab-panel children are in ORDER.
 * The panels keep their [hidden] toggling: while a drag is under way the
 * neighbour is revealed with .swipe-peer, both are moved with transforms, and
 * once the drag settles the tab is switched and the transforms dropped in the
 * same task, so [hidden] takes over without a visible jump.
 *
 * Vertical scrolling stays the browser's: main.component.css gives the host
 * `touch-action: pan-y`, so the browser takes a vertical pan (and sends
 * pointercancel) while a horizontal one reaches pointermove here.
 *
 * It also publishes the drag's progress as --planner-swipe-progress on
 * .planner-page, which the view switch's thumb follows.
 */
@Directive({
  selector: '[appPanelSwipe]',
  standalone: false
})
export class PanelSwipeDirective implements OnInit, OnDestroy {
  static readonly ORDER: readonly PlannerTab[] = ['equipment', 'affixes'];
  /** Above this both panels are on screen at once - see styles.css. */
  static readonly NARROW_QUERY = '(max-width: 994.98px)';

  /** Starts this close to the screen's edge belong to the OS back gesture. */
  private static readonly EDGE_PX = 16;
  /** Movement before a gesture is claimed as horizontal or left to the browser. */
  private static readonly LOCK_PX = 10;
  private static readonly COMMIT_FRACTION = 0.3;
  private static readonly FLICK_PX_PER_MS = 0.4;
  /** Resistance past the first or last view. */
  private static readonly EDGE_RESISTANCE = 0.3;
  static readonly SETTLE_MS = 200;

  private activeTab: PlannerTab = 'equipment';
  private tabSubscription?: Subscription;
  private removeListeners: (() => void)[] = [];

  private gesture: {
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    dx: number;
    claimed: boolean;
    from: number;
  } | null = null;
  private settling = false;
  private frame?: number;
  private settleTimer?: ReturnType<typeof setTimeout>;
  private finishSettle?: () => void;
  private removeTransitionListener?: () => void;

  constructor(
    private ref: ElementRef<HTMLElement>,
    private zone: NgZone,
    private equipped: EquippedService
  ) { }

  ngOnInit() {
    this.tabSubscription = this.equipped.getActiveMainTab().subscribe(tab => this.activeTab = tab);
    // Every pointermove repositions the panels; none of it needs change detection.
    this.zone.runOutsideAngular(() => {
      this.listen('pointerdown', event => this.onPointerDown(event as PointerEvent));
      this.listen('pointermove', event => this.onPointerMove(event as PointerEvent));
      this.listen('pointerup', event => this.onPointerUp(event as PointerEvent));
      this.listen('pointercancel', event => this.onPointerCancel(event as PointerEvent));
    });
  }

  ngOnDestroy() {
    this.tabSubscription?.unsubscribe();
    for (const remove of this.removeListeners) {
      remove();
    }
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    clearTimeout(this.settleTimer);
    this.reset();
  }

  private listen(type: string, handler: (event: Event) => void) {
    const host = this.ref.nativeElement;
    host.addEventListener(type, handler);
    this.removeListeners.push(() => host.removeEventListener(type, handler));
  }

  private onPointerDown(event: PointerEvent) {
    if (this.gesture || this.settling || !event.isPrimary || event.pointerType === 'mouse' || !this.isNarrow()) {
      return;
    }
    const edge = PanelSwipeDirective.EDGE_PX;
    if (event.clientX < edge || event.clientX > window.innerWidth - edge) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    this.gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      dx: 0,
      claimed: false,
      from: PanelSwipeDirective.ORDER.indexOf(this.activeTab)
    };
  }

  private onPointerMove(event: PointerEvent) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.claimed) {
      const lock = PanelSwipeDirective.LOCK_PX;
      if (Math.abs(dx) < lock && Math.abs(dy) < lock) {
        return;
      }
      if (Math.abs(dy) >= Math.abs(dx)) {
        // A scroll: the browser has it.
        this.gesture = null;
        return;
      }
      gesture.claimed = true;
      try {
        this.ref.nativeElement.setPointerCapture(event.pointerId);
      } catch {
        // Not capturable (e.g. already released) - the drag still works without it.
      }
      this.ref.nativeElement.classList.add('swiping');
      this.page()?.classList.add('planner-swiping');
    }

    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) {
      gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
    }
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    gesture.dx = dx;

    if (this.frame === undefined) {
      this.frame = requestAnimationFrame(() => {
        this.frame = undefined;
        if (this.gesture?.claimed) {
          this.render(this.gesture.from, this.gesture.dx);
        }
      });
    }
  }

  private onPointerUp(event: PointerEvent) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    if (!gesture.claimed) {
      // A tap.
      this.gesture = null;
      return;
    }

    const dx = event.clientX - gesture.startX;
    const target = this.neighbour(gesture.from, dx);
    const width = this.ref.nativeElement.clientWidth;
    const flicked = Math.abs(gesture.velocity) > PanelSwipeDirective.FLICK_PX_PER_MS
      && Math.sign(gesture.velocity) === Math.sign(dx);
    const commit = target !== null
      && (Math.abs(dx) > width * PanelSwipeDirective.COMMIT_FRACTION || flicked);
    this.settle(gesture.from, dx, commit);
  }

  private onPointerCancel(event: PointerEvent) {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    if (gesture.claimed) {
      this.settle(gesture.from, gesture.dx, false);
    } else {
      this.gesture = null;
    }
  }

  /** The index a drag of dx heads towards from `from`, or null past either end. */
  private neighbour(from: number, dx: number): number | null {
    const target = from + (dx < 0 ? 1 : -1);
    return dx !== 0 && target >= 0 && target < PanelSwipeDirective.ORDER.length ? target : null;
  }

  private render(from: number, dx: number) {
    const panels = this.panels();
    const target = this.neighbour(from, dx);
    const offset = target === null ? dx * PanelSwipeDirective.EDGE_RESISTANCE : dx;

    panels.forEach((panel, index) => {
      if (index === from) {
        panel.style.transform = `translateX(${offset}px)`;
      } else if (index === target) {
        panel.classList.add('swipe-peer');
        panel.style.transform = `translateX(calc(${(target - from) * 100}% + ${offset}px))`;
      } else {
        panel.classList.remove('swipe-peer');
        panel.style.transform = '';
      }
    });

    const width = this.ref.nativeElement.clientWidth;
    const progress = width ? from - offset / width : from;
    this.setProgress(Math.min(Math.max(progress, 0), PanelSwipeDirective.ORDER.length - 1));
  }

  private settle(from: number, dx: number, commit: boolean) {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.gesture = null;
    this.settling = true;

    const target = this.neighbour(from, dx);
    const to = commit && target !== null ? target : from;
    const finish = () => {
      if (this.finishSettle !== finish) {
        return;
      }
      this.finishSettle = undefined;
      clearTimeout(this.settleTimer);
      if (to !== from) {
        this.zone.run(() => this.equipped.setActiveMainTab(PanelSwipeDirective.ORDER[to]));
      }
      this.reset();
    };
    this.finishSettle = finish;

    if (this.prefersReducedMotion()) {
      finish();
      return;
    }

    // A flick can end before its first frame rendered; start from where it got to.
    this.render(from, dx);

    const host = this.ref.nativeElement;
    host.classList.add('swipe-settling');
    // Lets the thumb run its own transition to where it is going.
    this.page()?.classList.remove('planner-swiping');
    this.setProgress(to);
    const panels = this.panels();
    const panel = panels[from];
    panel.style.transform = `translateX(${(from - to) * 100}%)`;
    if (target !== null && panels[target]) {
      panels[target].style.transform = `translateX(${(target - to) * 100}%)`;
    }

    // transitionend bubbles, and the panel is full of things with transitions of their own.
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === panel && event.propertyName === 'transform') {
        finish();
      }
    };
    panel.addEventListener('transitionend', onTransitionEnd);
    this.removeTransitionListener = () => panel.removeEventListener('transitionend', onTransitionEnd);
    // transitionend never fires if nothing moved, or the panel was hidden meanwhile.
    this.settleTimer = setTimeout(finish, PanelSwipeDirective.SETTLE_MS + 50);
  }

  private reset() {
    this.gesture = null;
    this.settling = false;
    this.finishSettle = undefined;
    this.removeTransitionListener?.();
    this.removeTransitionListener = undefined;
    this.ref.nativeElement.classList.remove('swiping', 'swipe-settling');
    for (const panel of this.panels()) {
      panel.classList.remove('swipe-peer');
      panel.style.transform = '';
    }
    const page = this.page();
    page?.classList.remove('planner-swiping');
    page?.style.removeProperty('--planner-swipe-progress');
  }

  private setProgress(progress: number) {
    this.page()?.style.setProperty('--planner-swipe-progress', `${progress}`);
  }

  private panels(): HTMLElement[] {
    return Array.from(this.ref.nativeElement.querySelectorAll<HTMLElement>(':scope > .planner-tab-panel'));
  }

  private page(): HTMLElement | null {
    return this.ref.nativeElement.closest<HTMLElement>('.planner-page');
  }

  private isNarrow(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(PanelSwipeDirective.NARROW_QUERY).matches;
  }

  private prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
