import { buildFamilyRows, CraftingOptionText, defaultTier } from './crafting-option-rows';
import { Affix } from '../affixes/affix';
import { CraftingOptionRanking } from '../affixes/affix-ui.service';
import { CraftableOption } from '../gear/craftable-option';
import { groupCraftingOptions } from '../gear/crafting-option-families';
import { CraftableOptionInit } from '../gear/game-data-types';

describe('buildFamilyRows', () => {
  const option = (init: CraftableOptionInit) => new CraftableOption(init);
  const text: CraftingOptionText = {
    getAffixValue: (affix: Affix) => (affix.value > 0 ? '+' : '') + affix.value,
    getAffixValueText: (affix: Affix) => `+${affix.value} ${affix.type}`,
    describeSetBonus: (set: string) => `${set} bonus`,
  };

  const charisma = [1, 3, 5].map((value, i) =>
    option({ name: `Diamond of Charisma +${value}`, ml: 1 + i * 4, affixes: [{ name: 'Charisma', type: 'Enhancement', value }] }));
  const acid = option({ name: 'Topaz of Acid Absorption', ml: 10, affixes: [{ name: 'Acid Absorption', type: 'Enhancement', value: 10 }] });
  const ghostly = option({ name: 'Legendary Wraithborn Emerald', affixes: [{ name: 'Ghostly', type: 'Bool', value: 1 }] });
  const quickblade = option({ name: 'Set Augment: Quickblade', set: 'Quickblade' });
  const empty = new CraftableOption(null);

  function rows(options: CraftableOption[], rank: (option: CraftableOption) => Partial<CraftingOptionRanking> = () => ({})) {
    return buildFamilyRows(groupCraftingOptions(options),
      opt => ({ className: 'Irrelevant', tooltip: '', note: '', ...rank(opt) }), text);
  }
  const byLabel = (label: string, list: ReturnType<typeof rows>) => list.find(row => row.label === label)!;

  it('gives a family of tiers its bonus type beside it and its value range on the right', () => {
    const row = byLabel('Charisma', rows(charisma));

    expect(row.detail).toBe('Enhancement');
    expect(row.aside).toBe('+1 to +5');
    expect(row.tiers.map(tier => [tier.label, tier.name])).toEqual([
      ['+1 (ML 1)', 'Diamond of Charisma +1'],
      ['+3 (ML 5)', 'Diamond of Charisma +3'],
      ['+5 (ML 9)', 'Diamond of Charisma +5'],
    ]);
  });

  it('gives a single option its value beside it and its own name on the right', () => {
    const row = byLabel('Acid Absorption', rows([acid]));

    expect(row.detail).toBe('+10 Enhancement');
    expect(row.aside).toBe('Topaz of Acid Absorption');
  });

  it('gives an option without a valued affix no detail, and its own description as its tier label', () => {
    const row = byLabel('Ghostly', rows([ghostly]));

    expect(row.detail).toBe('');
    expect(row.aside).toBe('Legendary Wraithborn Emerald');
    expect(row.tiers[0]).toEqual(expect.objectContaining({ label: 'Legendary Wraithborn Emerald', name: '' }));
  });

  it('gives a set augment its set bonus beside it, and its note rather than its name on the right', () => {
    const plain = byLabel('Quickblade set', rows([quickblade]));
    expect(plain.detail).toBe('Quickblade bonus');
    expect(plain.aside).toBe('');

    const noted = byLabel('Quickblade set', rows([quickblade], () => ({ note: '1 of 3 set pieces' })));
    expect(noted.aside).toBe('1 of 3 set pieces');
    expect(noted.asideIsNote).toBe(true);
  });

  it('colours a family by its best tier, and counts it relevant when any tier is', () => {
    const row = byLabel('Charisma', rows(charisma, opt => ({ className: opt === charisma[0] ? 'Outranked' : 'Irrelevant' })));

    expect(row.className).toBe('Outranked');
    expect(row.relevant).toBe(true);
    expect(byLabel('Acid Absorption', rows([acid])).relevant).toBe(false);
  });

  it('never lets the empty option be hidden', () => {
    const list = rows([empty, acid, quickblade]);

    expect(byLabel('', list).hideable).toBe(false);
    expect(byLabel('Acid Absorption', list).hideable).toBe(true);
    expect(byLabel('Quickblade set', list).hideable).toBe(true);
  });

  it('searches the label, the detail and every tier\'s own name', () => {
    const row = byLabel('Charisma', rows(charisma));

    expect(row.searchText).toContain('charisma');
    expect(row.searchText).toContain('enhancement');
    expect(row.searchText).toContain('diamond of charisma +3');
  });
});

describe('defaultTier', () => {
  const tiers = [1, 3, 5, 7].map(value => new CraftableOption({ name: `+${value}`, affixes: [{ name: 'Charisma', type: 'Enhancement', value }] }));
  const ranks = ['Outranked', 'Best', 'Best', 'BestTied'];
  const [family] = buildFamilyRows(groupCraftingOptions(tiers),
    option => ({ className: ranks[tiers.indexOf(option)], tooltip: '', note: '' }),
    { getAffixValue: () => '', getAffixValueText: () => '', describeSetBonus: () => '' });

  it('is the best-ranked tier, the highest among equally ranked ones', () => {
    expect(defaultTier(family, null).option).toBe(tiers[2]);
  });

  it('is the selected tier when the family has it', () => {
    expect(defaultTier(family, tiers[0]).option).toBe(tiers[0]);
  });
});
