import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { NgbPopover } from '@ng-bootstrap/ng-bootstrap';
import { AffixDetails } from '../affixes/affix-ui.service';
import { TapTooltipOwner, TapTooltipPanelComponent } from '../tap-tooltip/tap-tooltip.component';

/** A hover only opens after this, so sweeping the pointer down a card doesn't flash every row's details. */
const HOVER_OPEN_DELAY_MS = 200;
/** And closes after this, so the pointer can cross the gap into the popover (to follow its wiki link). */
const HOVER_CLOSE_DELAY_MS = 200;

/** Template context for the details content: the popover shows the affix's name; the panel sits under its row. */
interface DetailsContext {
  heading: boolean;
}

/**
 * An affix's name, underlined when there's more to say about it (AffixUiService.getAffixDetails):
 * what it does, in DDO Wiki's words, and what a compound affix counts toward.
 *
 * Where the device can hover, the details are a popover: on hover, or pinned by a click (or Enter).
 * On touch, a tap opens them in `panel`, a full-width line under the row - a popover anchored to a
 * name a few words wide would be cramped on a phone. That's the media query tap-tooltip.component.css
 * hides the panel's bubble by, so the two never both show.
 */
@Component({
    selector: 'app-affix-name',
    templateUrl: './affix-name.component.html',
    styleUrls: ['./affix-name.component.css'],
    imports: [NgbPopover],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { style: 'display: contents' }
})
export class AffixNameComponent implements TapTooltipOwner, OnDestroy {
  @Input() name = '';
  @Input() details: AffixDetails | null = null;
  /** Where the details open on a touch device. Without one, they're a popover there too. */
  @Input() panel?: TapTooltipPanelComponent;

  @ViewChild('detailsContent', { static: true }) content!: TemplateRef<DetailsContext>;
  @ViewChild(NgbPopover) private popover?: NgbPopover;

  readonly text = '';
  readonly contentContext: DetailsContext = { heading: false };
  private readonly hoverCapable = typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches;
  /** Opened by a click: stays open until another click, Escape or a click elsewhere. */
  private pinned = false;
  private hoverTimer?: ReturnType<typeof setTimeout>;

  constructor(private elementRef: ElementRef<HTMLElement>) {
  }

  get usesPopover(): boolean {
    return this.hoverCapable || !this.panel;
  }

  get panelOpen(): boolean {
    return !!this.panel?.isOpenFor(this);
  }

  get wikiUrl(): string {
    return 'https://ddowiki.com/index.php?search=' + encodeURIComponent(this.name);
  }

  onClick(event: Event) {
    event.stopPropagation();
    if (!this.usesPopover) {
      this.panel!.toggle(this);
      return;
    }
    this.clearHoverTimer();
    if (this.pinned && this.popover?.isOpen()) {
      this.popover.close();
    } else {
      this.pinned = true;
      this.openPopover();
    }
  }

  onPointerEnter() {
    if (this.hoverCapable && !this.pinned) {
      this.schedule(() => this.openPopover(), HOVER_OPEN_DELAY_MS);
    }
  }

  onPointerLeave() {
    if (this.hoverCapable && !this.pinned) {
      this.schedule(() => this.popover?.close(), HOVER_CLOSE_DELAY_MS);
    }
  }

  /** The pointer reached the popover itself: keep it open. */
  keepOpen() {
    this.clearHoverTimer();
  }

  onPopoverHidden() {
    this.pinned = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as Node;
    if (this.panelOpen && !this.elementRef.nativeElement.contains(target) && !this.panel!.contains(target)) {
      this.panel!.close(this);
    }
  }

  ngOnDestroy() {
    this.clearHoverTimer();
    this.panel?.close(this);
  }

  private openPopover() {
    if (!this.popover?.isOpen()) {
      this.popover?.open({ heading: true } satisfies DetailsContext);
    }
  }

  private schedule(action: () => void, delayMs: number) {
    this.clearHoverTimer();
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = undefined;
      action();
    }, delayMs);
  }

  private clearHoverTimer() {
    if (this.hoverTimer !== undefined) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = undefined;
    }
  }
}
