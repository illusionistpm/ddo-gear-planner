import { buildFamilyRows, CraftingOptionText, defaultTier, gainChip } from './crafting-option-rows';
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
      opt => ({ className: 'Irrelevant', tooltip: '', note: '', optionTooltip: '', rankTooltip: '', changes: [], ...rank(opt) }), text);
  }
  const byLabel = (label: string, list: ReturnType<typeof rows>) => list.find(row => row.label === label)!;

  it('marks the tiers the trove has, and their family', () => {
    const list = buildFamilyRows(groupCraftingOptions([...charisma, acid]),
      () => ({ className: 'Irrelevant', tooltip: '', note: '', optionTooltip: '', rankTooltip: '', changes: [] }), text, opt => opt === charisma[1]);

    expect(byLabel('Charisma', list).owned).toBe(true);
    expect(byLabel('Charisma', list).tiers.map(tier => tier.owned)).toEqual([false, true, false]);
    expect(byLabel('Acid Absorption', list).owned).toBe(false);
    expect(byLabel('Acid Absorption', rows([acid])).owned).toBe(false);
  });

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

  it('names a value shared by several affixes once', () => {
    const mythic = option({ name: 'Mythic +3: PRR/MRR', affixes: [
      { name: 'Physical Sheltering', type: 'Mythic', value: 3 }, { name: 'Magical Sheltering', type: 'Mythic', value: 3 }] });

    expect(rows([mythic])[0].detail).toBe('+3 Mythic');
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

  it('lets a named option with no affixes be hidden, and names it once', () => {
    const masterworks = option({ name: 'Curse of Minor Masterworks' });
    const row = byLabel('Curse of Minor Masterworks', rows([masterworks]));

    expect(row.hideable).toBe(true);
    expect(row.aside).toBe('');
  });

  describe('what an option adds', () => {
    // The build has +3 Enhancement Charisma from elsewhere, so only the +5 adds anything.
    const charismaChange = (opt: CraftableOption) =>
      ({ name: 'Charisma', type: 'Enhancement', before: 3, after: Math.max(3, opt.affixes[0].value) });

    it('is a bare figure on an option with one affix, and a dash when something else gives as much', () => {
      const row = byLabel('Charisma', rows(charisma, opt => ({ className: 'BetterThanBest', changes: [charismaChange(opt)], rankTooltip: 'why' })));

      expect(row.tiers.map(tier => tier.gain)).toEqual([
        { text: '\u2014', direction: 'none' },
        { text: '\u2014', direction: 'none' },
        { text: '+2', direction: 'up' },
      ]);
      expect(row.tiers.map(tier => tier.changeLines)).toEqual([
        ['Charisma: stays +3 Enhancement'], ['Charisma: stays +3 Enhancement'], ['Charisma: +3 \u2192 +5 Enhancement'],
      ]);
      expect(row.tiers[2].why).toBe('why');
    });

    it('is the best tier\'s on the family, the highest of equally good tiers', () => {
      const row = byLabel('Charisma', rows(charisma, opt => ({ changes: [charismaChange(opt)] })));
      expect(row.bestTier.option).toBe(charisma[2]);

      expect(byLabel('Charisma', rows(charisma)).bestTier.option).toBe(charisma[2]);
      const capped = byLabel('Charisma', rows(charisma,
        opt => ({ changes: [{ name: 'Charisma', type: 'Enhancement', before: 0, after: opt === charisma[0] ? 1 : 0 }] })));
      expect(capped.bestTier.option).toBe(charisma[0]);
    });

    it('recolours by the net change where the rank, judging each bonus type alone, says otherwise', () => {
      // A +2 Festive ranks as the best Festive, but swapping out a +5 Insight loses 3.
      const loss = byLabel('Charisma', rows(charisma, () => ({ className: 'BetterThanBest', optionTooltip: 'what', rankTooltip: 'Better',
        changes: [{ name: 'Charisma', type: 'Festive', before: 0, after: 2 }, { name: 'Charisma', type: 'Insight', before: 5, after: 0 }] })));
      expect(loss.tiers[0].className).toBe('Outranked');
      expect(loss.tiers[0].why).toBe('Switching to it would lower the total');
      expect(loss.tiers[0].tooltip).toBe('what\n\nSwitching to it would lower the total');

      // A part of a tracked compound ranks Irrelevant, but completes the compound.
      const gain = byLabel('Acid Absorption', rows([acid], () => ({
        changes: [{ name: 'Elemental Absorption', type: 'Enhancement', before: 0, after: 10 }] })));
      expect(gain.className).toBe('BetterThanBest');
      expect(gain.relevant).toBe(true);
      expect(byLabel('Acid Absorption', rows([acid])).relevant).toBe(false);
    });

    it('keeps the rank\'s colour when the net change agrees, is nothing, or the rank is a penalty', () => {
      const change = (after: number) => ({ changes: [{ name: 'Charisma', type: 'Enhancement', before: 3, after }] });
      const colour = (className: string, after: number) =>
        byLabel('Charisma', rows(charisma, () => ({ className, rankTooltip: 'rank', ...change(after) }))).tiers[0];

      expect(colour('BetterThanBest', 5).className).toBe('BetterThanBest');
      expect(colour('Best', 3).className).toBe('Best');
      expect(colour('Best', 3).why).toBe('rank');
      expect(colour('Penalty', 1).className).toBe('Penalty');
      expect(colour('Mixed', 1).className).toBe('Mixed');
    });

    it('is nothing on an option that touches no tracked affix', () => {
      expect(byLabel('Acid Absorption', rows([acid])).tiers[0].gain).toBeNull();
    });

    it('names its affixes when the option has several, counting those past the second', () => {
      const change = (name: string, before: number, after: number) => ({ name, type: 'Artifact', before, after });

      expect(gainChip([change('Doublestrike', 0, 15), change('Doubleshot', 15, 15)], true))
        .toEqual({ text: '+15 Doublestrike', direction: 'up' });
      expect(gainChip([change('Strength', 0, 2), change('Dexterity', 0, 2), change('Wisdom', 0, 2), change('Charisma', 0, 2)], true))
        .toEqual({ text: '+2 Strength, +2 Dexterity, +2 more', direction: 'up' });
    });

    it('names the affix when the change is to another affix than the option\'s own', () => {
      // Switching to Charisma from a Strength augment.
      const row = byLabel('Charisma', rows(charisma, opt => ({ changes: [
        { name: 'Charisma', type: 'Enhancement', before: 3, after: Math.max(3, opt.affixes[0].value) },
        { name: 'Strength', type: 'Enhancement', before: 6, after: 0 }] })));

      expect(row.tiers[2].gain).toEqual({ text: '+2 Charisma, \u22126 Strength', direction: 'mixed' });
    });

    it('nets the bonus types of one affix, since they add up', () => {
      // Swapping a +5 Insight Dexterity for a +2 Festive one.
      expect(gainChip([
        { name: 'Dexterity', type: 'Festive', before: 0, after: 2 },
        { name: 'Dexterity', type: 'Insight', before: 5, after: 0 }], false)).toEqual({ text: '\u22123', direction: 'down' });
    });

    it('shows a loss, and a gain with a loss as mixed', () => {
      const change = (name: string, before: number, after: number) => ({ name, type: 'Artifact', before, after });

      expect(gainChip([change('Strength', 3, 0)], true)).toEqual({ text: '\u22123 Strength', direction: 'down' });
      expect(gainChip([change('Strength', 3, 0), change('Wisdom', 0, 2)], true))
        .toEqual({ text: '\u22123 Strength, +2 Wisdom', direction: 'mixed' });
    });

    it('calls an on/off effect new rather than +1', () => {
      const rowsFor = (before: number) => rows([ghostly], () => ({ changes: [{ name: 'Ghostly', type: 'Bool', before, after: 1 }] }));

      expect(rowsFor(0)[0].tiers[0].gain).toEqual({ text: 'new', direction: 'up' });
      expect(rowsFor(0)[0].tiers[0].changeLines).toEqual(['Ghostly: new']);
      expect(rowsFor(1)[0].tiers[0].gain).toEqual({ text: '\u2014', direction: 'none' });
      expect(rowsFor(1)[0].tiers[0].changeLines).toEqual(['Ghostly: already have it']);
    });
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
    option => ({ className: ranks[tiers.indexOf(option)], tooltip: '', note: '', optionTooltip: '', rankTooltip: '', changes: [] }),
    { getAffixValue: () => '', getAffixValueText: () => '', describeSetBonus: () => '' });

  it('is the best-ranked tier, the highest among equally ranked ones', () => {
    expect(defaultTier(family, null).option).toBe(tiers[2]);
  });

  it('is the selected tier when the family has it', () => {
    expect(defaultTier(family, tiers[0]).option).toBe(tiers[0]);
  });
});
