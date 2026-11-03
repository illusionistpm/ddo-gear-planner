import craftingList from '@data/crafting.json';

import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';
import { classifyCraftSelection, craftSystemName, CraftAcquisition } from './crafting-acquisition';
import { RawCraftingData } from './game-data-types';

const named = (name: string, quests: string[] = []) => new CraftableOption({ name, quests });

describe('classifyCraftSelection', () => {
  it('finds nothing to get for an empty selection', () => {
    expect(classifyCraftSelection('Blue Augment Slot', new CraftableOption(null))).toBe('none');
    expect(classifyCraftSelection('Lost Purpose', undefined)).toBe('none');
  });

  it('treats any coloured augment as its own acquisition, sourced or not', () => {
    expect(classifyCraftSelection('Red Augment Slot', named('Ruby of Frost (9d6)', ['Vendor']))).toBe('augment');
    expect(classifyCraftSelection('Colorless Augment Slot', named('Diamond of Balance'))).toBe('augment');
  });

  it('treats a random property as a roll, not a crafting choice', () => {
    expect(classifyCraftSelection('One of the following', named('Anything'))).toBe('roll');
    expect(classifyCraftSelection('Random set 1 (from Red Fens or Vault of Night)', named('Anything'))).toBe('roll');
  });

  it('treats a named, sourced option as an upgrade and anything else as a step', () => {
    expect(classifyCraftSelection('Dolorous (Weapon)', named('Dolorous Shard', ['Altar']))).toBe('upgrade');
    expect(classifyCraftSelection('Lost Purpose', named('Lost Purpose: Set'))).toBe('step');
    expect(classifyCraftSelection('T1 (Weapon)',
      new CraftableOption({ affixes: [{ name: 'Fire', type: 'Enhancement', value: 1 }], quests: ['Altar of Invasion'] })))
      .toBe('step');
    expect(classifyCraftSelection('Prefix',
      new CraftableOption({ affixes: [{ name: 'Strength', type: 'Enhancement', value: 7 }] }))).toBe('step');
  });

  // Every system in the data, by what its options classify as. A new system, or one
  // whose options change kind, fails here so someone decides how the list shows it.
  it('classifies every crafting system in the game data as expected', () => {
    const expected: Record<string, CraftAcquisition> = {};
    const byKind: Record<string, string[]> = {
      upgrade: [
        'Active',
        'Claw (Accessory)', 'Claw (Accessory) (artifact)', 'Claw (Weapon)',
        'Dolorous (Accessory)', 'Dolorous (Armor)', 'Dolorous (Weapon)', 'Dolorous (Weapon) (quarterstaff)',
        'Fang (Accessory)', 'Fang (Accessory) (artifact)', 'Fang (Armor)', 'Fang (Weapon)', 'Fang (Weapon) (quarterstaff)',
        'Horn (Accessory)', 'Horn (Accessory) (artifact)', 'Horn (Weapon)',
        'Melancholic (Accessory)', 'Melancholic (Armor)', 'Melancholic (Weapon)', 'Melancholic (Weapon) (quarterstaff)',
        'Miserable (Accessory)', 'Miserable (Weapon)',
        'Scale (Accessory)', 'Scale (Accessory) (artifact)', 'Scale (Armor)', 'Scale (Weapon)', 'Scale (Weapon) (quarterstaff)',
        'Woeful (Accessory)', 'Woeful (Weapon)',
      ],
      step: [
        'Almost There',
        'Isle of Dread: Set Bonus Slot: Empty',
        'Lost Purpose', 'Legendary Lost Purpose',
        'Slaver\'s Bonus Slot', 'Slaver\'s Extra Slot', 'Slaver\'s Prefix Slot', 'Slaver\'s Set Bonus', 'Slaver\'s Suffix Slot',
        'Legendary Slaver\'s Bonus Slot', 'Legendary Slaver\'s Extra Slot', 'Legendary Slaver\'s Prefix Slot',
        'Legendary Slaver\'s Set Bonus', 'Legendary Slaver\'s Suffix Slot',
        'Nearly Complete: Ability Score', 'Nearly Complete: Healing Amplification',
        'Nearly Complete: Insightful Ability Score', 'Nearly Complete: Quality Ability Score',
        'Nearly Complete: Skill', 'Nearly Complete: Spell Focus',
        'Nearly Finished',
        'Sealed in Fire', 'Sealed in Gloom', 'Sealed in Mist', 'Sealed in Undeath',
        'T1 (Equipment)', 'T1 (Weapon)', 'T2 (Equipment)', 'T2 (Weapon)', 'T3 (Equipment)', 'T3 (Weapon)',
        'Upgrade Tier', 'Upgradeable Item',
      ],
      augment: [
        'Blue Augment Slot', 'Colorless Augment Slot', 'Green Augment Slot', 'Moon Augment Slot', 'Orange Augment Slot',
        'Purple Augment Slot', 'Red Augment Slot', 'Sun Augment Slot', 'Yellow Augment Slot',
      ],
      roll: [
        'One of the following', 'One of the following Spell Power bonuses', 'One of the following ability bonuses',
        'One of the following bonuses', 'One of the following combinations', 'One of the following effects',
        'One of the following sets, at random', 'One of the following tactics bonuses',
        'Random effect',
        'Random set 1 (Legendary Vault of Night or Legendary Red Fens)',
        'Random set 1 (from Epic Vault of Night or Epic Red Fens)',
        'Random set 1 (from Red Fens or Vault of Night)',
        'Random set 2 (Legendary Chronoscope or Legendary Sands of Menechtarun)',
        'Random set 2 (from Chronoscope or Sands of Menechtarun)',
        'Random set 2 (from Epic Chronoscope or Epic Sands of Menechtarun)',
      ],
      // Augment upgrade slots pick a colour first; their options live in the colour's system.
      none: ['Upgradeable - Primary Augment', 'Upgradeable - Secondary Augment'],
    };
    for (const [kind, systems] of Object.entries(byKind)) {
      for (const system of systems) {
        expected[system] = kind as CraftAcquisition;
      }
    }

    const actual: Record<string, CraftAcquisition> = {};
    for (const [system, byItem] of Object.entries(craftingList as RawCraftingData)) {
      const kinds = new Set<CraftAcquisition>();
      for (const options of Object.values(byItem)) {
        for (const option of options) {
          const kind = classifyCraftSelection(system, new CraftableOption(option));
          if (kind !== 'none') {
            kinds.add(kind);
          }
        }
      }
      expect(kinds.size, `${system} mixes ${[...kinds].join(', ')}`).toBeLessThanOrEqual(1);
      actual[system] = kinds.values().next().value ?? 'none';
    }

    expect(actual).toEqual(expected);
  });
});

describe('craftSystemName', () => {
  it('is the chosen system for a slot that picks one, else the slot\'s own name', () => {
    const slot = new Craftable('Augment Slot 1', []);
    slot.setCraftingSystemOptions(new Map([['Blue Augment Slot', [named('Sapphire')]]]));
    expect(craftSystemName(slot)).toBe('Augment Slot 1');

    slot.selectByParamDescription('Blue Augment Slot: Sapphire');
    expect(craftSystemName(slot)).toBe('Blue Augment Slot');

    expect(craftSystemName(new Craftable('Lost Purpose', []))).toBe('Lost Purpose');
  });
});
