/**
 * Stepping through a drawer's list in a preview beside it: what's shown, and previous/next.
 * show() should be given exactly the list the user can see, so next/previous never step onto
 * a row that isn't rendered.
 */
export class PreviewCarousel<T> {
  private items: T[] = [];
  private index = -1;

  get current(): T | null {
    return this.index >= 0 ? this.items[this.index] : null;
  }

  show(items: ReadonlyArray<T>, index: number) {
    this.items = items.slice();
    this.index = index >= 0 && index < this.items.length ? index : -1;
  }

  close() {
    this.items = [];
    this.index = -1;
  }

  showPrevious(): boolean {
    if (!this.canShowPrevious()) {
      return false;
    }
    this.index -= 1;
    return true;
  }

  showNext(): boolean {
    if (!this.canShowNext()) {
      return false;
    }
    this.index += 1;
    return true;
  }

  canShowPrevious(): boolean {
    return this.index > 0;
  }

  canShowNext(): boolean {
    return this.index >= 0 && this.index < this.items.length - 1;
  }
}
