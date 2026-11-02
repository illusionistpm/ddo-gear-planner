import { getPackKeys, getSourcePack, isHiddenByPacks, isOptionHiddenByPacks, NO_PACK_KEY } from './pack-filter';
import { FiltersService } from '../planner/filters.service';

describe('pack-filter', () => {
  it("reads a source's pack from the pack map, and treats an unmapped one as free", () => {
    expect(getSourcePack('Book Burning')).toBe('Magic of Myth Drannor');
    expect(getSourcePack('DDO Store')).toBe('DDO Store');
    expect(getSourcePack('Not A Mapped Source')).toBeNull();
  });

  it('keys each distinct pack, with free sources and no sources as the free entry', () => {
    expect(getPackKeys(['Flocked Together', 'Stealing from Sorcere', 'Book Burning']))
      .toEqual(['Terror of Demogorgon', 'Magic of Myth Drannor']);
    expect(getPackKeys(['Book Burning', 'Not A Mapped Source'])).toEqual(['Magic of Myth Drannor', NO_PACK_KEY]);
    expect(getPackKeys([])).toEqual([NO_PACK_KEY]);
  });

  it('uses the same free key the filter stores', () => {
    expect(NO_PACK_KEY).toBe(FiltersService.NO_PACK_FILTER);
  });

  it('hides something only when every one of its packs is hidden', () => {
    const keys = ['Pack A', 'Pack B'];

    expect(isHiddenByPacks(keys, new Set())).toBe(false);
    expect(isHiddenByPacks(keys, new Set(['Pack A']))).toBe(false);
    expect(isHiddenByPacks(keys, new Set(['Pack A', 'Pack B']))).toBe(true);
  });

  it('never hides a crafting option with no sources', () => {
    const sourceless = { quests: [], packKeys: getPackKeys([]) };
    const sourced = { quests: ['Book Burning'], packKeys: getPackKeys(['Book Burning']) };
    const everything = new Set([NO_PACK_KEY, 'Magic of Myth Drannor']);

    expect(isOptionHiddenByPacks(sourceless, everything)).toBe(false);
    expect(isOptionHiddenByPacks(sourced, everything)).toBe(true);
    expect(isOptionHiddenByPacks(sourced, new Set([NO_PACK_KEY]))).toBe(false);
  });
});
