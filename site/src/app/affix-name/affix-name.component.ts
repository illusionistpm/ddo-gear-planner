import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { NgbPopover } from '@ng-bootstrap/ng-bootstrap';
import { AffixDetails } from '../affixes/affix-ui.service';
import { AffixDetailsComponent } from '../affix-details/affix-details.component';
import { canHover, HoverPopover } from '../affix-details/hover-popover';
import { TapTooltipOwner, TapTooltipPanelComponent } from '../tap-tooltip/tap-tooltip.component';

/** Template context for the details content: the popover shows the affix's name; the panel sits under its row. */
interface DetailsContext {
  heading: boolean;
}

/**
 * An affix's (or a read-only crafting option's) name, underlined when there's more to say about it
 * (AffixUiService.getAffixDetails, getCraftingOptionDetails): what it does, in DDO Wiki's words, and
 * what a compound affix counts toward.
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
    imports: [NgbPopover, AffixDetailsComponent],
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
  @ViewChild('trigger') private trigger?: ElementRef<HTMLElement>;

  readonly text = '';
  readonly contentContext: DetailsContext = { heading: false };
  readonly hover = new HoverPopover(() => this.popover, () => ({ heading: true } satisfies DetailsContext));
  private readonly hoverCapable = canHover();
  /** Opened by a click: stays open until another click, Escape or a click elsewhere. */
  private pinned = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {
  }

  get anchor(): HTMLElement | null {
    return this.trigger?.nativeElement ?? null;
  }

  get usesPopover(): boolean {
    return this.hoverCapable || !this.panel;
  }

  get panelOpen(): boolean {
    return !!this.panel?.isOpenFor(this);
  }

  onClick(event: Event) {
    event.stopPropagation();
    if (!this.usesPopover) {
      this.panel!.toggle(this);
      return;
    }
    this.hover.keepOpen();
    if (this.pinned && this.popover?.isOpen()) {
      this.popover.close();
    } else {
      this.pinned = true;
      if (!this.popover?.isOpen()) {
        this.popover?.open({ heading: true } satisfies DetailsContext);
      }
    }
  }

  onPointerEnter() {
    if (this.hoverCapable && !this.pinned) {
      this.hover.enter();
    }
  }

  onPointerLeave() {
    if (this.hoverCapable && !this.pinned) {
      this.hover.leave();
    }
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
    this.hover.destroy();
    this.panel?.close(this);
  }
}
