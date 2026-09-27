import { groupCraftingOptions } from './crafting-option-families';
import { CraftableOption } from './craftable-option';
import { CraftableOptionInit } from './game-data-types';

describe('groupCraftingOptions', () => {
  const option = (init: CraftableOptionInit) => new CraftableOption(init);

  it('groups options granting the same affixes into one family, lowest value first', () => {
    const families = groupCraftingOptions([
      option({ name: 'Diamond of Charisma +11', ml: 24, affixes: [{ name: 'Charisma', type: 'Enhancement', value: 11 }] }),
      option({ name: 'Diamond of Bluff +5', ml: 4, affixes: [{ name: 'Bluff', type: 'Competence', value: 5 }] }),
      option({ name: 'Diamond of Charisma +3', ml: 4, affixes: [{ name: 'Charisma', type: 'Enhancement', value: 3 }] }),
    ]);

    expect(families.map(family => family.label)).toEqual(['Bluff', 'Charisma']);
    expect(families[1].tiers.map(tier => tier.name)).toEqual(['Diamond of Charisma +3', 'Diamond of Charisma +11']);
  });

  it('breaks value ties by ML', () => {
    const families = groupCraftingOptions([
      option({ name: 'Late', ml: 30, affixes: [{ name: 'Doubleshot', type: 'Enhancement', value: 4 }] }),
      option({ name: 'Early', ml: 8, affixes: [{ name: 'Doubleshot', type: 'Enhancement', value: 4 }] }),
    ]);

    expect(families[0].tiers.map(tier => tier.name)).toEqual(['Early', 'Late']);
  });

  it('keeps families with the same affix but different bonus types apart, ordered by type', () => {
    const families = groupCraftingOptions([
      option({ name: 'Ins 1', affixes: [{ name: 'Charisma', type: 'Insight', value: 1 }] }),
      option({ name: 'Enh 1', affixes: [{ name: 'Charisma', type: 'Enhancement', value: 1 }] }),
      option({ name: 'Ins 2', affixes: [{ name: 'Charisma', type: 'Insight', value: 2 }] }),
      option({ name: 'Enh 3', affixes: [{ name: 'Charisma', type: 'Enhancement', value: 3 }] }),
    ]);

    expect(families.map(family => family.label)).toEqual(['Charisma', 'Charisma']);
    expect(families.map(family => family.tiers[0].affixes[0].type)).toEqual(['Enhancement', 'Insight']);
  });

  it('names a single option for its affix too, not its own name, and sorts it among the families', () => {
    const families = groupCraftingOptions([
      option({ name: 'Diamond of Insightful Dexterity +5', affixes: [{ name: 'Dexterity', type: 'Insight', value: 5 }] }),
      option({ name: 'Arrowbound Topaz', affixes: [{ name: 'Doubleshot', type: 'Enhancement', value: 4 }] }),
      option({ name: 'Diamond of Charisma +1', affixes: [{ name: 'Charisma', type: 'Enhancement', value: 1 }] }),
      option({ name: 'Diamond of Charisma +3', affixes: [{ name: 'Charisma', type: 'Enhancement', value: 3 }] }),
    ]);

    expect(families.map(family => family.label)).toEqual(['Charisma', 'Dexterity', 'Doubleshot']);
  });

  it('only groups options whose whole affix set matches', () => {
    const families = groupCraftingOptions([
      option({ name: 'Tea', affixes: [{ name: 'Efficient Metamagic - Empower', type: 'Enhancement', value: 4 }, { name: 'Universal Spell Power', type: 'Psionic', value: 24 }] }),
      option({ name: 'Empower', affixes: [{ name: 'Efficient Metamagic - Empower', type: 'Enhancement', value: 2 }] }),
    ]);

    expect(families.length).toBe(2);
  });

  it('keeps options without affixes - the empty option first, set augments named for their set - as families of their own', () => {
    const families = groupCraftingOptions([
      option({ name: 'Set Augment: Set B', set: 'Set B' }),
      option({ name: 'Set Augment: Set A', set: 'Set A' }),
      option(null as unknown as CraftableOptionInit),
    ]);

    expect(families.map(family => family.tiers.length)).toEqual([1, 1, 1]);
    expect(families.map(family => family.label)).toEqual(['', 'Set A set', 'Set B set']);
  });
});
