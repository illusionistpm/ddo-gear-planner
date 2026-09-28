import { SLOT_ICON_PATHS } from '../slot-icon/slot-icon-paths';
import { slotIcon, slotLabel, sortSlotsForDisplay } from './slot-display';

const SLOTS = [
  'Weapon', 'Offhand', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak', 'Gloves',
  'Goggles', 'Helm', 'Necklace', 'Ring1', 'Ring2', 'Trinket', 'Quiver'
];

describe('slot display', () => {
  it('gives every slot an icon that has path data', () => {
    for (const slot of SLOTS) {
      const key = slotIcon(slot);
      expect(key, slot).toBeDefined();
      expect(SLOT_ICON_PATHS[key!]?.d, slot).toBeTruthy();
    }
  });

  it('gives a slot it doesn\'t know no icon', () => {
    expect(slotIcon('Tail')).toBeUndefined();
  });

  it('spaces out a numbered slot\'s name', () => {
    expect(slotLabel('Ring1')).toBe('Ring 1');
    expect(slotLabel('Ring2')).toBe('Ring 2');
  });

  it('leaves every other slot\'s name alone', () => {
    expect(slotLabel('Helm')).toBe('Helm');
    expect(slotLabel('Offhand')).toBe('Offhand');
  });

  it('puts the weapons first, then runs head to toe', () => {
    expect(sortSlotsForDisplay(SLOTS)).toEqual([
      'Weapon', 'Offhand',
      'Helm', 'Goggles', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Bracers', 'Belt', 'Gloves', 'Ring1', 'Ring2', 'Boots',
      'Quiver'
    ]);
  });

  it('puts a slot it doesn\'t know last, alphabetically, rather than dropping it', () => {
    expect(sortSlotsForDisplay(['Tail', 'Boots', 'Horns', 'Helm'])).toEqual(['Helm', 'Boots', 'Horns', 'Tail']);
  });

  it('leaves the list it was given alone', () => {
    const slots = ['Boots', 'Helm'];

    sortSlotsForDisplay(slots);

    expect(slots).toEqual(['Boots', 'Helm']);
  });

  it('records an author for every icon, for the credits', () => {
    for (const [key, icon] of Object.entries(SLOT_ICON_PATHS)) {
      expect(icon.author, key).toBeTruthy();
    }
  });
});
