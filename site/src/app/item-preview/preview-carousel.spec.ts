import { PreviewCarousel } from './preview-carousel';

describe('PreviewCarousel', () => {
  it('steps through the list it was shown, stopping at either end', () => {
    const carousel = new PreviewCarousel<string>();
    carousel.show(['a', 'b', 'c'], 1);

    expect(carousel.current).toBe('b');
    expect(carousel.showNext()).toBe(true);
    expect(carousel.current).toBe('c');
    expect(carousel.canShowNext()).toBe(false);
    expect(carousel.showNext()).toBe(false);
    carousel.showPrevious();
    carousel.showPrevious();
    expect(carousel.current).toBe('a');
    expect(carousel.canShowPrevious()).toBe(false);
  });

  it('keeps its own copy of the list, and shows nothing once closed', () => {
    const items = ['a', 'b'];
    const carousel = new PreviewCarousel<string>();
    carousel.show(items, 0);
    items.push('c');
    carousel.showNext();
    expect(carousel.canShowNext()).toBe(false);

    carousel.close();
    expect(carousel.current).toBeNull();
    expect(carousel.canShowNext()).toBe(false);
  });
});
