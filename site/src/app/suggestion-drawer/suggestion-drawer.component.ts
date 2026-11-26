import { Component, ChangeDetectionStrategy, ElementRef, HostListener, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

import { SuggestionDrawerService } from './suggestion-drawer.service';
import { CloseRequestRelease, CloseRequestService } from '../shared/close-request.service';
import { isTypingTarget } from '../shared/keyboard-shortcuts';

/** How far down the drawer the selected row is held while the keyboard moves through the list. */
export const DRAWER_NAV_ANCHOR = 0.2;

@Component({
  selector: 'app-suggestion-drawer',
  templateUrl: './suggestion-drawer.component.html',
  styleUrls: ['./suggestion-drawer.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SuggestionDrawerComponent implements OnDestroy {
  private releaseCloseRequest: CloseRequestRelease | null = null;
  private readonly subscription: Subscription;

  constructor(
    public drawer: SuggestionDrawerService,
    closeRequests: CloseRequestService,
    private host: ElementRef<HTMLElement>
  ) {
    // Back gesture / Escape closes the drawer outright (not a step back
    // through its own view history), the same as the backdrop does.
    this.subscription = drawer.state$.subscribe(state => {
      if (state && !this.releaseCloseRequest) {
        this.releaseCloseRequest = closeRequests.listen(() => this.close());
      } else if (!state) {
        this.release();
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    this.release();
  }

  close() {
    this.drawer.close();
  }

  /**
   * The keyboard's way through whichever list the drawer shows: Down and Up
   * (or J and K, when not typing in a search) move focus between the
   * controls each view marks `data-drawer-nav` - one per row - from its
   * `data-drawer-search` box into the list and back out of its top. Enter
   * then does what a click would (equip, set, preview). With an item preview
   * open, it follows the selection through a list of items.
   *
   * Listened for on the whole document while the drawer is open: it covers
   * the page, and a view opened from a chip leaves focus on the chip behind it.
   *
   * The selected row is held at the same height in the drawer, so the eye
   * stays put while the list moves under it, rather than the focus running
   * to the bottom edge and the list jumping a row at a time.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const inSearch = !!target?.hasAttribute?.('data-drawer-search');
    if (isTypingTarget(target) && !inSearch) {
      // A select's arrows pick its options; another field keeps its own keys.
      return;
    }
    const key = event.key;
    if (key === 'Enter' && this.equipPreviewed(target)) {
      event.preventDefault();
      return;
    }
    const step = key === 'ArrowDown' || (!inSearch && key === 'j') ? 1
      : key === 'ArrowUp' || (!inSearch && key === 'k') ? -1
      : 0;
    const drawer = this.host.nativeElement.querySelector<HTMLElement>('.suggestion-drawer');
    if (!step || !drawer) {
      return;
    }
    const targets = Array.from(drawer.querySelectorAll<HTMLElement>('[data-drawer-nav]'))
      .filter(element => !(element as HTMLButtonElement).disabled);
    if (!targets.length) {
      return;
    }
    event.preventDefault();
    let index = target ? targets.indexOf(target) : -1;
    if (index === -1 && !inSearch) {
      // From elsewhere in the drawer (the preview, say): carry on from the previewed row.
      const previewed = drawer.querySelector('.selected-preview-row [data-drawer-nav]');
      index = previewed ? targets.indexOf(previewed as HTMLElement) : -1;
    }
    let next: HTMLElement | null;
    if (index === -1) {
      next = step > 0 ? targets[0] : targets[targets.length - 1];
    } else if (index + step < 0) {
      next = drawer.querySelector<HTMLElement>('[data-drawer-search]');
    } else {
      next = targets[Math.min(index + step, targets.length - 1)];
    }
    if (!next) {
      return;
    }
    next.focus({ preventScroll: true });
    this.holdInView(drawer, next);
    // Only a preview link: never an Equip or Set button, which would act.
    if (next.classList.contains('item-preview-link') && drawer.querySelector('.item-preview-panel')) {
      next.click();
    }
  }

  /**
   * Enter on the item already in the preview equips it, as the preview's own
   * Equip would: the first Enter previews, the second takes it.
   */
  private equipPreviewed(target: HTMLElement | null): boolean {
    const drawer = this.host.nativeElement.querySelector('.suggestion-drawer');
    if (!drawer || !target?.classList.contains('item-preview-link') || !target.closest('.selected-preview-row')) {
      return false;
    }
    const equip = drawer.querySelector<HTMLButtonElement>('.item-preview-panel .preview-equip-button');
    if (!equip || equip.disabled) {
      return false;
    }
    equip.click();
    return true;
  }

  /** Scrolls the drawer so the row holding `control` sits at the anchor height (as far as the list allows). */
  private holdInView(drawer: HTMLElement, control: HTMLElement) {
    const row = control.closest<HTMLElement>('[data-drawer-row], .item-result-row') ?? control;
    const drawerTop = drawer.getBoundingClientRect().top;
    const rowTop = row.getBoundingClientRect().top - drawerTop;
    const anchor = drawer.clientHeight * DRAWER_NAV_ANCHOR;
    const top = drawer.scrollTop + rowTop - anchor;
    drawer.scrollTo?.({ top: Math.max(0, top) });
    if (!drawer.scrollTo) {
      drawer.scrollTop = Math.max(0, top);
    }
  }

  private release() {
    this.releaseCloseRequest?.();
    this.releaseCloseRequest = null;
  }
}
