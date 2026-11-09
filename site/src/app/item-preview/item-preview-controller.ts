import { Item } from '../gear/item';
import { PreviewCarousel } from './preview-carousel';

/**
 * Carousel state for the item preview shown beside a suggestion drawer's list.
 * The owning component holds one, passes it to <app-item-preview>, and uses
 * isPreviewing() to highlight the matching row.
 *
 * show() should be given exactly the list the user can see, so next/previous
 * never step onto a row that isn't rendered.
 */
export class ItemPreviewController {
  item: Item | null = null;
  private readonly carousel = new PreviewCarousel<Item>();

  /** @param prepare adjusts each previewed copy before it is shown. */
  constructor(private readonly prepare: (item: Item) => void = () => undefined) { }

  show(item: Item, items: Item[], index: number) {
    this.carousel.show(items, index);
    this.setItem(item);
  }

  close() {
    this.item = null;
    this.carousel.close();
  }

  showPrevious() {
    if (this.carousel.showPrevious()) {
      this.setItem(this.carousel.current!);
    }
  }

  showNext() {
    if (this.carousel.showNext()) {
      this.setItem(this.carousel.current!);
    }
  }

  canShowPrevious(): boolean {
    return this.carousel.canShowPrevious();
  }

  canShowNext(): boolean {
    return this.carousel.canShowNext();
  }

  isPreviewing(item: Item): boolean {
    return !!this.item
      && this.item.name === item.name && this.item.slot === item.slot && this.item.ml === item.ml;
  }

  private setItem(item: Item) {
    this.item = new Item(item);
    this.prepare(this.item);
  }
}
