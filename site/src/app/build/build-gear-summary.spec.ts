import { Item, ItemInit } from '../gear/item';
import { gearSummaryLabel, gearSummaryOf, shortWeaponName } from './build-gear-summary';

function item(name: string, slot: string, ml: number): Item {
  return new Item({ name, slot, ml, affixes: [] } as unknown as ItemInit);
}

describe('gearSummaryOf', () => {
  it('names the weapon and spans the equipped gear\'s minimum levels', () => {
    const summary = gearSummaryOf(new Map<string, Item | null>([
      ['Weapon', item('Kinesis, the Hidden Force', 'Weapon', 34)],
      ['Ring1', item('Some Ring', 'Ring1', 33)],
      ['Belt', item('Some Belt', 'Belt', 35)],
      ['Helm', null],
    ]));

    expect(summary).toEqual({ weapon: 'Kinesis, the Hidden Force', minLevel: 33, maxLevel: 35 });
  });

  it('leaves the quiver out of the level range: most are ML 1 or 20 whatever the build', () => {
    const summary = gearSummaryOf(new Map<string, Item | null>([
      ['Weapon', item('A Repeater', 'Weapon', 33)],
      ['Quiver', item('Quiver of Alacrity', 'Quiver', 1)],
    ]));

    expect(summary).toEqual({ weapon: 'A Repeater', minLevel: 33, maxLevel: 33 });
  });

  it('gives a range without a weapon, and nothing at all for no gear', () => {
    expect(gearSummaryOf(new Map([['Belt', item('Some Belt', 'Belt', 20)]]))).toEqual({ minLevel: 20, maxLevel: 20 });
    expect(gearSummaryOf(new Map<string, Item | null>([['Weapon', null]]))).toBeNull();
  });
});

describe('shortWeaponName', () => {
  it('shortens Legendary, and drops an epithet after a comma and a trailing level', () => {
    expect(shortWeaponName('Legendary Calamitous Sceptre')).toBe('Leg. Calamitous Sceptre');
    expect(shortWeaponName('Kinesis, the Hidden Force')).toBe('Kinesis');
    expect(shortWeaponName('Legendary Hull-Melter\'s Mace (level 32)')).toBe('Leg. Hull-Melter\'s Mace');
    expect(shortWeaponName('The Slayer of the Living')).toBe('The Slayer of the Living');
  });
});

describe('gearSummaryLabel', () => {
  it('reads weapon and range, and one level when the range is a single level', () => {
    expect(gearSummaryLabel({ weapon: 'Kinesis, the Hidden Force', minLevel: 33, maxLevel: 35 })).toBe('Kinesis · ML 33–35');
    expect(gearSummaryLabel({ weapon: 'Epic Elyd Edge', minLevel: 20, maxLevel: 20 })).toBe('Epic Elyd Edge · ML 20');
    expect(gearSummaryLabel({ minLevel: 33, maxLevel: 35 })).toBe('ML 33–35');
  });

  it('is empty for no summary, and ignores fields of the wrong type', () => {
    expect(gearSummaryLabel(null)).toBe('');
    expect(gearSummaryLabel(undefined)).toBe('');
    expect(gearSummaryLabel({ weapon: 7, minLevel: '1', maxLevel: 35 })).toBe('');
  });
});
