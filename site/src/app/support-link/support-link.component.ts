import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * The Ko-fi ("buy me a coffee") button and its popover, in the planner's top
 * bar and on every page with the site's header.
 *
 * Buy Me a Coffee's own floating widget always pins itself to the page's
 * corner (its script hardcodes that), which looked disconnected once the
 * trigger moved into the top bar. Its support form is just an embeddable
 * page (https://www.buymeacoffee.com/widget/page/<slug>), so show that in a
 * small popover anchored under our own button instead.
 */
@Component({
  selector: 'app-support-link',
  templateUrl: './support-link.component.html',
  styleUrls: ['./support-link.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class SupportLinkComponent {
  /** Emits when the popover opens, so the info popover beside it can close. */
  @Output() opened = new EventEmitter<void>();

  readonly url: SafeResourceUrl;
  open = false;
  /** Where the popover's top goes on a narrow screen, where it is pinned to the viewport's sides. */
  popoverTop = 0;

  constructor(sanitizer: DomSanitizer, private readonly host: ElementRef<HTMLElement>, private readonly cdr: ChangeDetectorRef) {
    this.url = sanitizer.bypassSecurityTrustResourceUrl(
      'https://www.buymeacoffee.com/widget/page/illusionistpm'
      + '?description=' + encodeURIComponent('Support me on Buy me a coffee!')
      + '&color=' + encodeURIComponent('#5F7FFF')
    );
  }

  toggle(button: HTMLElement): void {
    this.open = !this.open;
    if (this.open) {
      this.popoverTop = button.getBoundingClientRect().bottom + 6;
      this.opened.emit();
    }
  }

  /** Also called from outside this (OnPush) view: the info button beside it, or a page covering the planner. */
  close(): void {
    this.open = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /** A click anywhere else closes it. Clicks inside the form's iframe never reach the document. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
