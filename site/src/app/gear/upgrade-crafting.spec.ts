import type { AffixService } from '../affixes/affix.service';
import { isCraftingSlotAvailable, normalizeAugmentSlots, openFilledUpgradeSlots } from './augment-slots';
import { Item } from './item';

/**
 * An upgrade that changes the item itself: an option that replaces some of the item's
 * own affixes (`replaces`) and opens a slot the item lists (`addsCrafting`).
 */
function upgradeableRing(): Item {
  return new Item({
    name: 'Ring', slot: 'Ring', ml: 20,
    affixes: [
      { name: 'Seeker', type: 'Enhancement', value: '9' },
      { name: 'Ethereal', type: 'Bool', value: 1 },
      { name: 'Manslayer', type: 'Bool', value: 1 },
    ],
    crafting: [
      {
        name: 'Upgrade Tier',
        options: [
          {
            name: 'Tier 2',
            affixes: [{ name: 'Seeker', type: 'Enhancement', value: '10' }, { name: 'Ghostly', type: 'Bool', value: 1 }],
            replaces: [{ name: 'Seeker', type: 'Enhancement', value: '9' }, { name: 'Ethereal', type: 'Bool', value: 1, by: 'Ghostly' }],
          },
          {
            name: 'Tier 3',
            affixes: [{ name: 'Seeker', type: 'Enhancement', value: '11' }, { name: 'Ghostly', type: 'Bool', value: 1 }],
            replaces: [{ name: 'Seeker', type: 'Enhancement', value: '9' }, { name: 'Ethereal', type: 'Bool', value: 1, by: 'Ghostly' }],
            addsCrafting: ['Green Augment Slot'],
          },
        ],
      },
      { name: 'Green Augment Slot', options: [{ name: 'Green Gem', affixes: [{ name: 'Wisdom', type: 'Insight', value: 2 }] }] },
      { name: 'Blue Augment Slot', options: [{ name: 'Blue Gem', affixes: [{ name: 'Intelligence', type: 'Insight', value: 2 }] }] },
    ],
  });
}

const active = (item: Item) => item.getActiveAffixes().map(affix => `${affix.name} ${affix.value}`);
const shown = (item: Item) => item.getUpgradedOwnAffixes().map(row => `${row.affix.name} ${row.affix.value}${row.replaced ? ' (was ' + row.replaced.name + ' ' + row.replaced.value + ')' : ''}`);

describe('upgrades that change the item itself', () => {
  it('counts the item as it drops until an upgrade is chosen', () => {
    const ring = upgradeableRing();

    expect(active(ring)).toEqual(['Seeker 9', 'Ethereal 1', 'Manslayer 1']);
    expect(shown(ring)).toEqual(['Seeker 9', 'Ethereal 1', 'Manslayer 1']);
  });

  it('drops the affixes an upgrade replaces, and shows its own in their place', () => {
    const ring = upgradeableRing();
    ring.getCraftingByName('Upgrade Tier')!.selectByParamDescription('Tier 2');

    expect(active(ring)).toEqual(['Manslayer 1', 'Seeker 10', 'Ghostly 1']);
    expect(shown(ring)).toEqual(['Seeker 10 (was Seeker 9)', 'Ghostly 1 (was Ethereal 1)', 'Manslayer 1']);
    expect(ring.getUpgradedOwnAffixes()[0].by?.name).toBe('Tier 2');
  });

  it('keeps a slot an upgrade adds closed until a tier that adds it is chosen', () => {
    const ring = upgradeableRing();
    const tiers = ring.getCraftingByName('Upgrade Tier')!;
    const green = ring.getCraftingByName('Green Augment Slot')!;
    const blue = ring.getCraftingByName('Blue Augment Slot')!;

    expect(isCraftingSlotAvailable(ring, green)).toBe(false);
    expect(isCraftingSlotAvailable(ring, blue)).toBe(true);
    expect(isCraftingSlotAvailable(ring, tiers)).toBe(true);

    tiers.selectByParamDescription('Tier 2');
    expect(isCraftingSlotAvailable(ring, green)).toBe(false);

    tiers.selectByParamDescription('Tier 3');
    expect(isCraftingSlotAvailable(ring, green)).toBe(true);
  });

  it('counts nothing in a closed slot, and empties it when normalized', () => {
    const ring = upgradeableRing();
    const tiers = ring.getCraftingByName('Upgrade Tier')!;
    const green = ring.getCraftingByName('Green Augment Slot')!;
    tiers.selectByParamDescription('Tier 3');
    green.selectByParamDescription('Green Gem');
    expect(active(ring)).toContain('Wisdom 2');

    tiers.selectByParamDescription('Tier 2');
    expect(active(ring)).not.toContain('Wisdom 2');
    expect(ring.getMatchingBonusType('Wisdom', 'Insight', undefined as unknown as AffixService, true)).toBeNull();

    normalizeAugmentSlots(ring);
    expect(green.getSelectedParamDescription()).toBe('');
  });

  it('chooses the first upgrade that opens a slot a saved build filled without one', () => {
    const ring = upgradeableRing();
    const tiers = ring.getCraftingByName('Upgrade Tier')!;
    ring.getCraftingByName('Green Augment Slot')!.selectByParamDescription('Green Gem');

    openFilledUpgradeSlots(ring);

    expect(tiers.getSelectedParamDescription()).toBe('Tier 3');
    expect(active(ring)).toContain('Wisdom 2');
  });

  it('leaves an upgrade already chosen alone', () => {
    const ring = upgradeableRing();
    const tiers = ring.getCraftingByName('Upgrade Tier')!;
    tiers.selectByParamDescription('Tier 2');
    ring.getCraftingByName('Green Augment Slot')!.selectByParamDescription('Green Gem');

    openFilledUpgradeSlots(ring);

    expect(tiers.getSelectedParamDescription()).toBe('Tier 2');
  });

  it('keeps all of it through a copy', () => {
    const ring = upgradeableRing();
    ring.getCraftingByName('Upgrade Tier')!.selectByParamDescription('Tier 3');
    const copy = new Item(ring);

    expect(isCraftingSlotAvailable(copy, copy.getCraftingByName('Green Augment Slot')!)).toBe(true);
    expect(shown(copy)).toEqual(shown(ring));
  });
});
