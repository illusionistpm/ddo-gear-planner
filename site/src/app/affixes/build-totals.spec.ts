import { Affix } from './affix';
import { AffixService } from './affix.service';
import { ExternalAffixEntry } from './external-affix';
import {
  affixTotal, bestValueFor, BuildView, compoundBonusTypes, COMPOUND_PARTS_SLOT, sourcesFor, valuesForAffixType
} from './build-totals';
import { FILIGREE_BONUS_TYPE } from '../gear/filigree';
import { Item } from '../gear/item';
import { FiligreeContribution, filigreeContributionsFor } from '../planner/filigree-loadout';

/**
 * A compound affix is worth, per bonus type, the lowest of what the build gives its parts.
 */
describe('build totals: a compound affix through its parts', () => {
  let affixSvc: AffixService;

  beforeEach(() => {
    affixSvc = new AffixService();
    affixSvc.affixGroups.clear();
    affixSvc.affixGroupComponents.clear();
    affixSvc.affixGroups.set('Radiance Lore', ['Light Lore', 'Alignment Lore']);
    affixSvc.affixGroups.set('Purifying Flame Lore', ['Fire Lore', 'Light Lore']);
    affixSvc.affixGroups.set('Universal Spell Lore', ['Fire Lore', 'Light Lore', 'Alignment Lore']);
    affixSvc.affixGroups.set('Dazing', ['Stunning']);
    affixSvc.affixGroups.set('Riposte', ['Armor Class', 'Will Save']);
    affixSvc.affixGroupComponents.set('Riposte', [
      { name: 'Armor Class', type: '<TypeAlreadyParsed>', value: '<HalfValueRoundedUp>' },
      { name: 'Will Save', type: '<TypeAlreadyParsed>', value: '<ValueAlreadyParsed>' },
    ]);
  });

  const item = (slot: string, ...affixes: Array<[string, string, number]>) =>
    new Item({ name: slot + ' item', slot, ml: 1, affixes: affixes.map(([name, type, value]) => ({ name, type, value })) });

  function view(items: Item[], extra: {
    sets?: Array<[string, Affix[]]>; external?: ExternalAffixEntry[]; filigree?: FiligreeContribution[];
  } = {}): BuildView {
    return {
      items: () => items.map(equipped => [equipped.slot, equipped] as [string, Item]),
      setBonuses: () => extra.sets ?? [],
      externalEntries: () => extra.external ?? [],
      filigreeFor: (affixName, bonusType) => filigreeContributionsFor(extra.filigree ?? [], affixName, bonusType),
    };
  }

  it('has the lower of its parts\' values', () => {
    const build = view([item('Ring1', ['Light Lore', 'Equipment', 22]), item('Ring2', ['Fire Lore', 'Equipment', 15])]);

    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Equipment')).toBe(15);
    expect(bestValueFor(build, affixSvc, 'Radiance Lore', 'Equipment')).toBe(0);
  });

  it('needs every part in the same bonus type', () => {
    const build = view([item('Ring1', ['Light Lore', 'Equipment', 22]), item('Ring2', ['Fire Lore', 'Insight', 10])]);

    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Equipment')).toBe(0);
    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Insight')).toBe(0);
    expect(compoundBonusTypes(build, affixSvc, 'Purifying Flame Lore')).toEqual([]);
  });

  it('takes a part from another compound, a set bonus or a non-gear value', () => {
    const build = view([item('Ring1', ['Radiance Lore', 'Insight', 9])], {
      sets: [['Some Set', [new Affix({ name: 'Fire Lore', type: 'Insight', value: 7 })]]],
      external: [{ id: 'x', affixName: 'Fire Lore', bonusType: 'Quality', kind: 'value', value: 3, label: 'Spell' },
        { id: 'y', affixName: 'Light Lore', bonusType: 'Quality', kind: 'value', value: 4, label: 'Spell' }],
    });

    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Insight')).toBe(7);
    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Quality')).toBe(3);
    expect(compoundBonusTypes(build, affixSvc, 'Purifying Flame Lore').sort()).toEqual(['Insight', 'Quality']);
  });

  it('keeps the compound\'s own higher value', () => {
    const build = view([
      item('Ring1', ['Purifying Flame Lore', 'Equipment', 22]),
      item('Ring2', ['Fire Lore', 'Equipment', 30]),
    ]);

    expect(bestValueFor(build, affixSvc, 'Purifying Flame Lore', 'Equipment')).toBe(22);
    // Nothing beyond the item that gives it outright.
    expect(valuesForAffixType(build, affixSvc, 'Purifying Flame Lore', 'Equipment')).toEqual([{ slot: 'Ring1', value: 22 }]);
  });

  it('lists the parts\' value as one more value, for ranking against', () => {
    const build = view([item('Ring1', ['Light Lore', 'Equipment', 22]), item('Ring2', ['Fire Lore', 'Equipment', 15])]);

    expect(valuesForAffixType(build, affixSvc, 'Purifying Flame Lore', 'Equipment'))
      .toEqual([{ slot: COMPOUND_PARTS_SLOT, value: 15 }]);
    // As it would be with Ring2 replaced: no Fire Lore, so no compound.
    expect(valuesForAffixType(build, affixSvc, 'Purifying Flame Lore', 'Equipment', { skipSlot: 'Ring2' })).toEqual([]);
  });

  it('doesn\'t count a universal companion, which stacks with the parts instead', () => {
    const build = view([
      item('Ring1', ['Universal Spell Lore', 'Implement', 5]),
      item('Ring2', ['Light Lore', 'Implement', 3]),
    ]);

    expect(bestValueFor(build, affixSvc, 'Light Lore', 'Implement')).toBe(5);
    expect(bestValueFor(build, affixSvc, 'Radiance Lore', 'Implement')).toBe(0);
    expect(bestValueFor(build, affixSvc, 'Universal Spell Lore', 'Implement')).toBe(5);
    expect(compoundBonusTypes(build, affixSvc, 'Radiance Lore')).toEqual([]);
  });

  it('isn\'t made up for a universal companion, a group of one, or a group with its own component values', () => {
    const build = view([item('Ring1',
      ['Fire Lore', 'Equipment', 5], ['Light Lore', 'Equipment', 5], ['Alignment Lore', 'Equipment', 5],
      ['Stunning', 'Enhancement', 10], ['Armor Class', 'Insight', 4], ['Will Save', 'Insight', 4])]);

    expect(bestValueFor(build, affixSvc, 'Universal Spell Lore', 'Equipment')).toBe(0);
    expect(bestValueFor(build, affixSvc, 'Dazing', 'Enhancement')).toBe(0);
    expect(bestValueFor(build, affixSvc, 'Riposte', 'Insight')).toBe(0);
  });

  it('adds up a summed type per part without counting the compound\'s own twice', () => {
    const filigree = (itemName: string, name: string, value: number, group?: string): FiligreeContribution => ({
      host: 'weapon', slot: 'Filigree', itemName, affix: new Affix({ name, type: FILIGREE_BONUS_TYPE, value }),
      ...(group ? { group } : {}),
    });
    const build = view([], { filigree: [
      filigree('A', 'Radiance Lore', 2),
      filigree('A', 'Light Lore', 2, 'Radiance Lore'),
      filigree('A', 'Alignment Lore', 2, 'Radiance Lore'),
      filigree('B', 'Light Lore', 3),
      filigree('C', 'Alignment Lore', 1),
      filigree('D', 'Light Lore', 9, 'Universal Spell Lore'),
      filigree('D', 'Alignment Lore', 9, 'Universal Spell Lore'),
    ] });

    // Light Lore 2 + 3, Alignment Lore 2 + 1, the universal filigree left out of both.
    expect(bestValueFor(build, affixSvc, 'Radiance Lore', FILIGREE_BONUS_TYPE)).toBe(3);
    expect(sourcesFor(build, affixSvc, 'Radiance Lore', FILIGREE_BONUS_TYPE).map(source => source.itemName).sort())
      .toEqual(['A', 'B', 'C']);
  });

  it('names what supplies each part as its sources, each once', () => {
    const build = view([
      item('Ring1', ['Light Lore', 'Equipment', 22]),
      item('Ring2', ['Fire Lore', 'Equipment', 15]),
      item('Neck', ['Purifying Flame Lore', 'Equipment', 15]),
    ]);

    expect(sourcesFor(build, affixSvc, 'Purifying Flame Lore', 'Equipment').map(source => source.slot).sort())
      .toEqual(['Neck', 'Ring1', 'Ring2']);
  });

  it('counts towards the affix\'s total, under a bonus type game data doesn\'t list for it', () => {
    const build = view([item('Ring1', ['Light Lore', 'Insight', 11]), item('Ring2', ['Fire Lore', 'Insight', 10])]);
    const rules = {
      allLevelTypes: (name: string) => name === 'Purifying Flame Lore' ? ['Equipment'] : [],
      isUniversalCompanionOnly: () => false,
      isGroupMember: (affixName: string, groupName: string) => affixSvc.isGroupMember(affixName, groupName),
    };

    const total = affixTotal(build, affixSvc, rules, 'Purifying Flame Lore');

    expect(total.total).toBe(10);
    expect(total.types.map(type => [type.bonusType, type.value])).toEqual([['Insight', 10]]);
    expect(total.types[0].sources.map(source => source.slot).sort()).toEqual(['Ring1', 'Ring2']);
  });

  it('is given by a universal companion that gives all its parts', () => {
    expect(affixSvc.isGroupMember('Radiance Lore', 'Universal Spell Lore')).toBe(true);
    expect(affixSvc.isGroupMember('Light Lore', 'Universal Spell Lore')).toBe(true);
    affixSvc.affixGroups.set('Frozen Storm Lore', ['Cold Lore', 'Light Lore']);
    expect(affixSvc.isGroupMember('Frozen Storm Lore', 'Universal Spell Lore')).toBe(false);
    expect(affixSvc.isGroupMember('Universal Spell Lore', 'Universal Spell Lore')).toBe(false);
  });
});
