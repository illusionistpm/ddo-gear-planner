import { normalizeAugmentSlots, openFilledUpgradeSlots } from './augment-slots';
import { Item } from './item';

const TIER_1 = 'Legendary Alchemical Tier 1';
const TIER_2 = 'Legendary Alchemical Tier 2';
const TIER_3 = 'Legendary Alchemical Tier 3';

/**
 * Legendary Alchemical Crafting: Tier 3's element must be Tier 1's or Tier 2's. Its
 * options name those tiers in `elementFrom`, and every option its `element`.
 */
function alchemicalItem(): Item {
  const tier = (n: number, elementFrom?: string[]) => ({
    name: `Legendary Alchemical Tier ${n}`,
    options: ['Air', 'Earth', 'Fire'].map(element => ({
      name: `${element}: Tier ${n}`, element, elementFrom,
      affixes: [{ name: 'Strength', type: 'Alchemical', value: element === 'Fire' ? 3 : 2 }],
      addsCrafting: n === 3 && element === 'Air' ? ['Orange Augment Slot'] : undefined,
    })),
  });
  return new Item({
    name: 'Legendary Alchemical Longsword', slot: 'Weapon', ml: 29,
    crafting: [
      tier(1), tier(2), tier(3, [TIER_1, TIER_2]),
      { name: 'Orange Augment Slot', options: [{ name: 'Orange Gem', affixes: [{ name: 'Dexterity', type: 'Insight', value: 2 }] }] },
    ],
  });
}

const choose = (item: Item, system: string, option: string) => item.getCraftingByName(system)!.selectByParamDescription(option);
const chosen = (item: Item, system: string) => item.getCraftingByName(system)!.selected.name;
const option = (item: Item, system: string, name: string) => item.getCraftingByName(system)!.options.find(each => each.name === name)!;

describe('an option that must share an element with other tiers', () => {
  it('is allowed while Tier 1 or Tier 2 is empty, since it can yet be crafted to match', () => {
    const item = alchemicalItem();
    expect(item.isOptionAllowed(option(item, TIER_3, 'Fire: Tier 3'))).toBe(true);

    choose(item, TIER_1, 'Air: Tier 1');
    expect(item.isOptionAllowed(option(item, TIER_3, 'Fire: Tier 3'))).toBe(true);
  });

  it('is allowed only of Tier 1\'s or Tier 2\'s element once both are chosen', () => {
    const item = alchemicalItem();
    choose(item, TIER_1, 'Air: Tier 1');
    choose(item, TIER_2, 'Earth: Tier 2');

    expect(item.isOptionAllowed(option(item, TIER_3, 'Air: Tier 3'))).toBe(true);
    expect(item.isOptionAllowed(option(item, TIER_3, 'Earth: Tier 3'))).toBe(true);
    expect(item.isOptionAllowed(option(item, TIER_3, 'Fire: Tier 3'))).toBe(false);
    // Tiers 1 and 2 themselves are unconstrained.
    expect(item.isOptionAllowed(option(item, TIER_1, 'Fire: Tier 1'))).toBe(true);
  });

  it('is cleared when normalized once neither tier has its element, closing the slot it opened', () => {
    const item = alchemicalItem();
    choose(item, TIER_1, 'Air: Tier 1');
    choose(item, TIER_2, 'Earth: Tier 2');
    choose(item, TIER_3, 'Air: Tier 3');
    choose(item, 'Orange Augment Slot', 'Orange Gem');

    choose(item, TIER_1, 'Fire: Tier 1');
    normalizeAugmentSlots(item);

    expect(chosen(item, TIER_3)).toBe('');
    expect(chosen(item, 'Orange Augment Slot')).toBe('');
  });

  it('is kept when normalized while one tier still has its element', () => {
    const item = alchemicalItem();
    choose(item, TIER_1, 'Air: Tier 1');
    choose(item, TIER_2, 'Earth: Tier 2');
    choose(item, TIER_3, 'Air: Tier 3');

    choose(item, TIER_2, 'Air: Tier 2');
    normalizeAugmentSlots(item);

    expect(chosen(item, TIER_3)).toBe('Air: Tier 3');
  });

  it('is never picked as an item\'s best source of a bonus when not allowed', () => {
    const item = alchemicalItem();
    choose(item, TIER_1, 'Air: Tier 1');
    choose(item, TIER_2, 'Earth: Tier 2');
    const tier3Only = (candidate: { elementFrom: ReadonlyArray<string> }) => candidate.elementFrom.length > 0;

    // Fire's +3 would win, but neither Tier 1 nor Tier 2 is Fire.
    item.selectMatchingBonusType('Strength', 'Alchemical', undefined, tier3Only);

    expect(chosen(item, TIER_3)).toBe('Air: Tier 3');
  });

  it('isn\'t chosen to open a filled slot from an old build when not allowed', () => {
    const item = alchemicalItem();
    choose(item, TIER_1, 'Earth: Tier 1');
    choose(item, TIER_2, 'Fire: Tier 2');
    choose(item, 'Orange Augment Slot', 'Orange Gem');

    openFilledUpgradeSlots(item);

    expect(chosen(item, TIER_3)).toBe('');
  });
});
