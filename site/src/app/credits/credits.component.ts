import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Output } from '@angular/core';
import buildInfo from '@data/build-info.json';

import { formatBuiltAt } from '../shared/format-built-at';
import { SLOT_ICON_PATHS } from '../slot-icon/slot-icon-paths';

/**
 * The info button in the top bar and its popover: where the game data comes from,
 * when it was built, and the credits the icons' licences require. Projected into
 * build-actions' overflow menu on narrow screens, like the Ko-fi and theme buttons.
 */
@Component({
  selector: 'app-credits',
  templateUrl: './credits.component.html',
  styleUrls: ['./credits.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class CreditsComponent {
  /** Emits when the popover opens, so the Ko-fi popover beside it can close. */
  @Output() opened = new EventEmitter<void>();

  open = false;
  /** Where the popover's top goes on a narrow screen, where it is pinned to the viewport's sides. */
  popoverTop = 0;
  readonly dataBuiltAt = formatBuiltAt(buildInfo.builtAt);
  /** Every author whose icon is in use, in the order they first appear. */
  readonly iconAuthors = [...new Set(Object.values(SLOT_ICON_PATHS).map(icon => icon.author))];

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef) { }

  toggle() {
    this.open = !this.open;
    if (this.open) {
      this.popoverTop = this.host.nativeElement.getBoundingClientRect().bottom + 6;
      this.opened.emit();
    }
  }

  /** Also called by the Ko-fi button in main, from outside this (OnPush) view. */
  close() {
    this.open = false;
    this.cdr.markForCheck();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  /** "A, B, C and D". */
  get iconAuthorList(): string {
    const authors = this.iconAuthors;
    return authors.length > 1
      ? `${authors.slice(0, -1).join(', ')} and ${authors[authors.length - 1]}`
      : authors.join('');
  }
}
