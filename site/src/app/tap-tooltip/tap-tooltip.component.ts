import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * What a TapTooltipPanelComponent shows for whichever trigger opened it: plain text, or - for
 * richer content, like an affix's details (AffixNameComponent) - a template and its context.
 */
export interface TapTooltipOwner {
  readonly text: string;
  /** The element that opened the panel, which its bubble's caret points up at. */
  readonly anchor?: HTMLElement | null;
  readonly content?: TemplateRef<unknown> | null;
  readonly contentContext?: object;
}

/**
 * Wraps projected content (usually an icon) with a tap-to-reveal tooltip. A native
 * [title] never shows on a touch tap, so this shows the same text as an inline bubble
 * on click/tap instead, and closes it again on an outside tap. `display: contents` on
 * the host keeps the button and bubble as direct children of whatever layout wraps this
 * component, so a Bootstrap `.row`'s flex-wrap still works around them as if they were
 * written inline.
 *
 * Inline, the bubble is only as wide as the element holding the trigger - on a phone, an
 * affix row's name column is a few words wide and the text becomes a tall, narrow strip.
 * Give it a `[panel]` placed as a direct child of the row and the bubble opens there
 * instead, as a full-width line under the row.
 */
@Component({
    selector: 'app-tap-tooltip',
    templateUrl: './tap-tooltip.component.html',
    styleUrls: ['./tap-tooltip.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { style: 'display: contents' }
})
export class TapTooltipComponent implements TapTooltipOwner, OnDestroy {
  @Input() text = '';
  @Input() label = 'Show details';
  @Input() panel?: TapTooltipPanelComponent;
  private openInline = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {
  }

  get isOpen(): boolean {
    return this.panel ? this.panel.isOpenFor(this) : this.openInline;
  }

  get anchor(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector('.tap-tooltip-trigger');
  }

  toggle(event: Event) {
    event.stopPropagation();
    if (this.panel) {
      this.panel.toggle(this);
    } else {
      this.openInline = !this.openInline;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as Node;
    if (this.isOpen && !this.elementRef.nativeElement.contains(target) && !this.panel?.contains(target)) {
      this.close();
    }
  }

  ngOnDestroy() {
    this.panel?.close(this);
  }

  private close() {
    if (this.panel) {
      this.panel.close(this);
    } else {
      this.openInline = false;
    }
  }
}

/** The caret's closest approach to the bubble's rounded corner, and how far into a long trigger it points. */
const CARET_MIN_X = 14;
const CARET_MAX_INSET = 16;

/**
 * Where a `TapTooltipComponent` given it as `[panel]` opens its bubble. Place it as a
 * direct child of the row the tooltip describes: its host is `display: contents`, so the
 * bubble becomes a row item itself, and a Bootstrap `.row` gives it the full width on a
 * line of its own. Clicks inside it don't bubble to the row, which may have handlers of
 * its own (the Non-gear card's header opens the add panel).
 */
@Component({
    selector: 'app-tap-tooltip-panel',
    template: `@if (owner) {<div class="tap-tooltip-bubble tap-tooltip-panel-bubble" (click)="$event.stopPropagation()" [class.tap-tooltip-has-caret]="caretX !== null" [style.--tap-tooltip-caret-x.px]="caretX">@if (owner.content) {<ng-container *ngTemplateOutlet="owner.content; context: owner.contentContext" />} @else {{{owner.text}}}</div>}`,
    imports: [NgTemplateOutlet],
    styleUrls: ['./tap-tooltip.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { style: 'display: contents' }
})
export class TapTooltipPanelComponent {
  owner: TapTooltipOwner | null = null;
  /** Where the caret sits along the bubble's top edge, under the trigger; null for none. */
  caretX: number | null = null;

  constructor(private elementRef: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) {
  }

  isOpenFor(tooltip: TapTooltipOwner): boolean {
    return this.owner === tooltip;
  }

  contains(node: Node): boolean {
    return this.elementRef.nativeElement.contains(node);
  }

  toggle(tooltip: TapTooltipOwner) {
    this.owner = this.owner === tooltip ? null : tooltip;
    this.caretX = this.owner ? this.caretOffset(this.owner) : null;
    this.cdr.markForCheck();
  }

  /**
   * The bubble is a full-width line of the row (the host is display: contents), so its left edge
   * is the row's content edge. The caret points at the start of the trigger's text - the middle of
   * a long, wrapped affix name could be far from where its first word is.
   */
  private caretOffset(owner: TapTooltipOwner): number | null {
    const anchor = owner.anchor;
    const row = this.elementRef.nativeElement.parentElement;
    if (!anchor || !row) {
      return null;
    }
    const anchorBox = anchor.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    const contentLeft = row.getBoundingClientRect().left
      + (parseFloat(rowStyle.borderLeftWidth) || 0) + (parseFloat(rowStyle.paddingLeft) || 0);
    return Math.max(CARET_MIN_X, anchorBox.left - contentLeft + Math.min(anchorBox.width / 2, CARET_MAX_INSET));
  }

  close(tooltip: TapTooltipOwner) {
    if (this.owner === tooltip) {
      this.owner = null;
      this.cdr.markForCheck();
    }
  }
}
