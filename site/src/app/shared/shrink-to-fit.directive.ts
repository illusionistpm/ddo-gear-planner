import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy } from '@angular/core';

/**
 * Shrinks an element's font size (down to a floor) so its content fits on one
 * line. If it still doesn't fit at the floor, the text wraps normally at that
 * floor size. Re-fits when the element's width or its content changes.
 */
@Directive({
  selector: '[appShrinkToFit]',
  standalone: false
})
export class ShrinkToFitDirective implements AfterViewInit, OnDestroy {
  /** Smallest font size, as a fraction of the natural size. */
  @Input() minScale = 0.85;

  private static readonly STEP = 0.02;

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private lastWidth = -1;

  constructor(private ref: ElementRef<HTMLElement>, private zone: NgZone) { }

  ngAfterViewInit() {
    // Observer callbacks only touch inline styles, so keep them out of change detection.
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(entries => {
        // Fitting changes the height (wrap <-> no wrap); only refit when the width changed.
        const width = entries[0].contentRect.width;
        if (width !== this.lastWidth) {
          this.lastWidth = width;
          this.fit();
        }
      });
      this.resizeObserver.observe(this.ref.nativeElement);

      this.mutationObserver = new MutationObserver(() => this.fit());
      this.mutationObserver.observe(this.ref.nativeElement,
        { childList: true, characterData: true, subtree: true });
    });
    this.fit();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  private fit() {
    const el = this.ref.nativeElement;
    el.style.fontSize = '';
    el.style.whiteSpace = 'nowrap';

    const style = getComputedStyle(el);
    const baseSize = parseFloat(style.fontSize);
    const available = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!available || this.contentWidth(el) <= available) {
      el.style.whiteSpace = '';
      return;
    }

    for (let scale = 1 - ShrinkToFitDirective.STEP; scale >= this.minScale - 0.001;
        scale -= ShrinkToFitDirective.STEP) {
      el.style.fontSize = `${baseSize * scale}px`;
      if (this.contentWidth(el) <= available) {
        el.style.whiteSpace = '';
        return;
      }
    }

    // Doesn't fit even at the floor size: let it wrap.
    el.style.fontSize = `${baseSize * this.minScale}px`;
    el.style.whiteSpace = '';
  }

  private contentWidth(el: HTMLElement): number {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().width;
  }
}
