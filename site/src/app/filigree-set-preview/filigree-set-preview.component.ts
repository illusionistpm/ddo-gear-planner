import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { PreviewCarousel } from '../item-preview/preview-carousel';

/**
 * A filigree set's details beside the bonus-type drawer, with previous/next through the drawer's
 * list of sets: the item preview's window, for a set.
 */
@Component({
  selector: 'app-filigree-set-preview',
  templateUrl: './filigree-set-preview.component.html',
  styleUrls: ['../item-preview/item-preview.component.css'],
  // The carousel is mutated in place, so there is no input change for OnPush to see.
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class FiligreeSetPreviewComponent {
  @Input({ required: true }) preview!: PreviewCarousel<string>;
  /** A filigree to mark among the set's pieces: the one whose row opened it. */
  @Input() highlightFiligree: string | null = null;
}
