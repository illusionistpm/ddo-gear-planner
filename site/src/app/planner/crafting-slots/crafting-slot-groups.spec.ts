import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { Item } from '../../gear/item';
import { deriveCraftingSlotOverview, FLEXIBLE_AUGMENT_GROUP } from './crafting-slot-groups';

describe('deriveCraftingSlotOverview', () => {
  it('groups slots by type, naming the gear slot and item of each', () => {
    const overview = deriveCraftingSlotOverview(new Map([
      ['Helm', item('Helm', 'Sunny Helm', slot('Sun Augment Slot'), slot('Blue Augment Slot'))],
      ['Weapon', item('Weapon', 'Sunny Sword', slot('Sun Augment Slot'), slot('Green Steel Tier 1'))],
    ]));

    expect(overview.groups.map(group => group.name)).toEqual(['Sun Augment Slot', 'Blue Augment Slot', 'Green Steel Tier 1']);
    const sun = overview.groups.find(group => group.name === 'Sun Augment Slot')!;
    // Gear-slot display order: the weapon before the helm.
    expect(sun.rows.map(row => [row.gearSlot, row.item.name])).toEqual([['Weapon', 'Sunny Sword'], ['Helm', 'Sunny Helm']]);
  });

  it('counts each coloured augment type, and how many are empty, leaving other systems out of the summary', () => {
    const filled = slot('Sun Augment Slot');
    filled.selected = filled.options[1];
    const overview = deriveCraftingSlotOverview(new Map([
      ['Helm', item('Helm', 'Helm', filled, slot('Sun Augment Slot'), slot('Green Steel Tier 1'))],
      ['Belt', item('Belt', 'Belt', slot('Red Augment Slot'))],
    ]));

    expect(overview.summary).toEqual([
      { label: 'Sun', groupName: 'Sun Augment Slot', total: 2, empty: 1 },
      { label: 'Red', groupName: 'Red Augment Slot', total: 1, empty: 1 },
    ]);
    expect(overview.groups.find(group => group.name === 'Sun Augment Slot')!.rows.map(row => row.empty)).toEqual([false, true]);
  });

  it('orders Sun, Moon, Purple, Orange, Red, Green, Blue, Yellow, Colorless, the flexible slots, then the rest alphabetically', () => {
    const overview = deriveCraftingSlotOverview(new Map([
      ['Helm', item('Helm', 'Helm', slot('Upgrade Tier'), slot('Colorless Augment Slot'), slot('Blue Augment Slot'), slot('Yellow Augment Slot'))],
      ['Belt', item('Belt', 'Belt', slot('Purple Augment Slot'), slot('Green Steel Tier 1'), slot('Moon Augment Slot'), slot('Red Augment Slot'))],
      ['Boots', item('Boots', 'Boots', slot('Orange Augment Slot'), slot('Sun Augment Slot'), slot('Green Augment Slot'))],
      ['Armor', essenceCrafted()],
    ]));

    expect(overview.groups.map(group => group.name)).toEqual([
      'Sun Augment Slot', 'Moon Augment Slot',
      'Purple Augment Slot', 'Orange Augment Slot', 'Red Augment Slot',
      'Green Augment Slot', 'Blue Augment Slot', 'Yellow Augment Slot',
      'Colorless Augment Slot', FLEXIBLE_AUGMENT_GROUP,
      'Green Steel Tier 1', 'Upgrade Tier',
    ]);
    expect(overview.summary.map(chip => chip.label)).toEqual(
      ['Sun', 'Moon', 'Purple', 'Orange', 'Red', 'Green', 'Blue', 'Yellow', 'Colorless', 'Flexible']);
  });

  it('keeps two slots of one colour on one item apart', () => {
    const overview = deriveCraftingSlotOverview(new Map([
      ['Ring1', item('Ring1', 'Ring', slot('Colorless Augment Slot'), slot('Colorless Augment Slot'))],
    ]));

    expect(overview.groups[0].rows.map(row => row.key)).toEqual(['Ring1|Colorless Augment Slot#1', 'Ring1|Colorless Augment Slot#2']);
  });

  it('skips empty gear slots and gear with no crafting', () => {
    const overview = deriveCraftingSlotOverview(new Map<string, Item | null>([
      ['Helm', null],
      ['Belt', item('Belt', 'Plain Belt')],
    ]));

    expect(overview).toEqual({ groups: [], summary: [] });
  });

  describe('an essence-crafted item\'s augment slots', () => {
    it('are flexible, and slot 2 only counts once slot 1 has a colour', () => {
      const armor = essenceCrafted();
      const before = deriveCraftingSlotOverview(new Map([['Armor', armor]]));
      expect(before.groups.map(group => [group.name, group.rows.length, group.empty])).toEqual([[FLEXIBLE_AUGMENT_GROUP, 1, 1]]);
      expect(before.summary).toEqual([{ label: 'Flexible', groupName: FLEXIBLE_AUGMENT_GROUP, total: 1, empty: 1 }]);

      armor.getCraftingByName('Augment Slot 1')!.selectCraftingSystem('Blue Augment Slot');
      const after = deriveCraftingSlotOverview(new Map([['Armor', armor]]));
      expect(after.groups.map(group => [group.name, group.rows.length])).toEqual([[FLEXIBLE_AUGMENT_GROUP, 2]]);
    });

    it('stay flexible once given a colour, so the row stays put', () => {
      const armor = essenceCrafted();
      const slotOne = armor.getCraftingByName('Augment Slot 1')!;
      slotOne.selectCraftingSystem('Blue Augment Slot');
      slotOne.selected = slotOne.options[1];

      const overview = deriveCraftingSlotOverview(new Map([['Armor', armor]]));

      expect(overview.groups.map(group => group.name)).toEqual([FLEXIBLE_AUGMENT_GROUP]);
      expect(overview.groups[0].rows.map(row => row.empty)).toEqual([false, true]);
    });

    it('clears slot 2 when slot 1 no longer allows it, as the gear card does', () => {
      const armor = essenceCrafted();
      armor.getCraftingByName('Augment Slot 2')!.selectCraftingSystem('Colorless Augment Slot');

      deriveCraftingSlotOverview(new Map([['Armor', armor]]));

      expect(armor.getCraftingByName('Augment Slot 2')!.selectedCraftingSystemName).toBe('');
    });
  });
});

function item(gearSlot: string, name: string, ...crafting: Craftable[]): Item {
  const result = new Item(null);
  result.name = name;
  result.slot = gearSlot;
  result.ml = 30;
  result.crafting = crafting;
  return result;
}

function slot(name: string): Craftable {
  return new Craftable(name, [new CraftableOption({ name: `${name} Augment`, ml: 1, affixes: [{ name: 'Strength', type: 'Enhancement', value: 1 }] })]);
}

function essenceCrafted(): Item {
  const augment = (name: string, systems: string[]) => {
    const craftable = new Craftable(name, []);
    craftable.setCraftingSystemOptions(new Map(systems.map(system =>
      [system, [new CraftableOption({ name: `${system} Test`, ml: 1, affixes: [{ name: 'Strength', type: 'Enhancement', value: 1 }] })]])));
    return craftable;
  };
  return item('Armor', 'Essence Crafting Armor',
    augment('Augment Slot 1', ['Colorless Augment Slot', 'Blue Augment Slot', 'Green Augment Slot']),
    augment('Augment Slot 2', ['Colorless Augment Slot', 'Blue Augment Slot']));
}
