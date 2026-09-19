import { Item } from '../item';

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
  private items: Item[] = [];
  private index = -1;

  /** @param prepare adjusts each previewed copy before it is shown. */
  constructor(private readonly prepare: (item: Item) => void = () => undefined) { }

  show(item: Item, items: Item[], index: number) {
    this.items = items.slice();
    this.index = index;
    this.setItem(item);
  }

  close() {
    this.item = null;
    this.items = [];
    this.index = -1;
  }

  showPrevious() {
    if (this.canShowPrevious()) {
      this.index -= 1;
      this.setItem(this.items[this.index]);
    }
  }

  showNext() {
    if (this.canShowNext()) {
      this.index += 1;
      this.setItem(this.items[this.index]);
    }
  }

  canShowPrevious(): boolean {
    return this.index > 0;
  }

  canShowNext(): boolean {
    return this.index >= 0 && this.index < this.items.length - 1;
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
