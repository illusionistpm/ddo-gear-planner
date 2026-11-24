import { NgbPopover } from '@ng-bootstrap/ng-bootstrap';

/** A hover only opens after this, so sweeping the pointer down a card doesn't flash every row's details. */
const HOVER_OPEN_DELAY_MS = 200;
/** And closes after this, so the pointer can cross the gap into the popover (to follow its wiki link). */
const HOVER_CLOSE_DELAY_MS = 200;

/** Whether the device can hover: where it can't, details open by tap instead (see AffixNameComponent). */
export function canHover(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
}

/**
 * Opens a manually triggered NgbPopover on hover, after a short delay, and keeps it open while the
 * pointer is over the popover itself. Call destroy() from the owner's ngOnDestroy: a pending timer
 * would otherwise outlive it.
 */
export class HoverPopover {
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly popover: () => NgbPopover | undefined, private readonly context: () => object = () => ({})) {
  }

  enter() {
    this.schedule(() => {
      const popover = this.popover();
      if (popover && !popover.isOpen()) {
        popover.open(this.context());
      }
    }, HOVER_OPEN_DELAY_MS);
  }

  leave() {
    this.schedule(() => this.popover()?.close(), HOVER_CLOSE_DELAY_MS);
  }

  /** The pointer reached the popover itself. */
  keepOpen() {
    this.clear();
  }

  closeNow() {
    this.clear();
    this.popover()?.close();
  }

  destroy() {
    this.clear();
  }

  private schedule(action: () => void, delayMs: number) {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      action();
    }, delayMs);
  }

  private clear() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
