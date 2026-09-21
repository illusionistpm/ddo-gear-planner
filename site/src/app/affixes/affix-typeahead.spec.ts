import { AffixService } from './affix.service';
import { buildAffixTypeaheadEntries } from './affix-typeahead';

describe('buildAffixTypeaheadEntries', () => {
  it('pairs each affix name with its synonyms', () => {
    const affixSvc = { getSynonyms: (name: string) => name === 'Strength' ? ['STR'] : [] } as unknown as AffixService;

    expect(buildAffixTypeaheadEntries(['Strength', 'Wisdom'], affixSvc)).toEqual([
      { name: 'Strength', synonyms: ['STR'] },
      { name: 'Wisdom', synonyms: [] },
    ]);
  });
});
