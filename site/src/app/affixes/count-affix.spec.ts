import { getCountAffixChipLabel, getCountAffixUnit, isCountAffix } from './count-affix';

describe('count affixes', () => {
  it('describes Max Filigree Slots as a count of slots', () => {
    expect(isCountAffix('Max Filigree Slots')).toBe(true);
    expect(getCountAffixUnit('Max Filigree Slots')).toBe('slots');
    expect(getCountAffixChipLabel('Max Filigree Slots')).toBe('Slots');
  });

  it('leaves ordinary affixes alone', () => {
    expect(isCountAffix('Strength')).toBe(false);
    expect(getCountAffixUnit('Strength')).toBeUndefined();
    expect(getCountAffixChipLabel('Strength')).toBeUndefined();
  });
});
