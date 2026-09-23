import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input } from '@angular/core';

/**
 * Wraps projected content (usually an icon) with a tap-to-reveal tooltip. A native
 * [title] never shows on a touch tap, so this shows the same text as an inline bubble
 * on click/tap instead, and closes it again on an outside tap. `display: contents` on
 * the host keeps the button and bubble as direct children of whatever layout wraps this
 * component, so a Bootstrap `.row`'s flex-wrap still works around them as if they were
 * written inline.
 */
@Component({
    selector: 'app-tap-tooltip',
    templateUrl: './tap-tooltip.component.html',
    styleUrls: ['./tap-tooltip.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
    host: { style: 'display: contents' }
})
export class TapTooltipComponent {
  @Input() text = '';
  @Input() label = 'Show details';
  isOpen = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {
  }

  toggle(event: Event) {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.isOpen && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isOpen = false;
    }
  }
}
