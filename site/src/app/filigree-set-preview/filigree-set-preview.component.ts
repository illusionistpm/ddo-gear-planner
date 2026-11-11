import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { PreviewCarousel } from '../item-preview/preview-carousel';

/** What the preview shows: a set, or a filigree's set (both, for a raid filigree) with it marked. */
export interface FiligreeSetPreviewEntry {
  sets: ReadonlyArray<string>;
  /** The filigree whose row opened it; null when a set's row did. */
  filigree: string | null;
}

/**
 * A filigree set's details beside the bonus-type drawer, with previous/next through the drawer's
 * list of sets or of filigrees: the item preview's window, for a set.
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
  @Input({ required: true }) preview!: PreviewCarousel<FiligreeSetPreviewEntry>;
}
