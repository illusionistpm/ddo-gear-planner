/**
 * How an equipment slot is presented: its label and icon. Slot names come from the
 * game data (GearDbService.getSlots()), so anything not listed here still works -
 * it shows its raw name and no icon.
 */

const SLOT_ICONS: Readonly<Record<string, string>> = {
  Helm: 'heavy-helm',
  Goggles: 'sunglasses',
  Necklace: 'pearl-necklace',
  Cloak: 'cloak',
  Armor: 'breastplate',
  Bracers: 'bracers',
  Gloves: 'metal-hand',
  Belt: 'belt-armor',
  Ring1: 'big-diamond-ring',
  Ring2: 'big-diamond-ring',
  Boots: 'metal-boot',
  Trinket: 'charm',
  Weapon: 'broadsword',
  Offhand: 'checked-shield',
  Quiver: 'quiver'
};

/**
 * The order slots are shown in: the weapons first, as they shape the rest of the
 * build, then head to toe - with the trinket beside the necklace - then the quiver.
 */
export const SLOT_DISPLAY_ORDER: ReadonlyArray<string> = [
  'Weapon', 'Offhand',
  'Helm', 'Goggles', 'Necklace', 'Trinket', 'Armor', 'Cloak', 'Bracers', 'Belt', 'Gloves', 'Ring1', 'Ring2', 'Boots',
  'Quiver'
];

/**
 * Slots in display order. One this doesn't know goes last, alphabetically - slots
 * come from the game data, so a new one mustn't vanish.
 */
export function sortSlotsForDisplay(slots: ReadonlyArray<string>): string[] {
  const rank = (slot: string) => {
    const index = SLOT_DISPLAY_ORDER.indexOf(slot);
    return index === -1 ? SLOT_DISPLAY_ORDER.length : index;
  };
  return [...slots].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The key into SLOT_ICON_PATHS for a slot, or undefined when it has no icon. */
export function slotIcon(slot: string): string | undefined {
  return SLOT_ICONS[slot];
}

/** The number that tells a pair of slots apart ("1" for Ring1), or '' for a slot that's one of a kind. */
export function slotNumber(slot: string): string {
  return /(\d+)$/.exec(slot)?.[1] ?? '';
}

/** A slot's name for display: "Ring1" reads as "Ring 1". */
export function slotLabel(slot: string): string {
  return slot.replace(/^(\D+)(\d+)$/, '$1 $2');
}

/** The slots whose items come in kinds worth naming: a long sword, a buckler, light armor. */
const SLOTS_WITH_ITEM_TYPES: ReadonlySet<string> = new Set(['Weapon', 'Offhand', 'Armor']);

/** Plurals the generic rule below would get wrong. */
const ITEM_TYPE_SINGULARS: Readonly<Record<string, string>> = {
  Handwraps: 'Handwraps',
};

/**
 * An item's kind as a card shows it beside the slot name - "Long Sword", "Buckler",
 * "Light Armor" - or '' when its slot doesn't name kinds or it has none (the Essence
 * Crafting blanks). Game data names the kinds as plural categories ("Long Swords",
 * "Large shields", "Cloth armor"); the last word is singularised and every word
 * capitalised, so a kind added to the data reads sensibly without a change here.
 */
export function itemTypeLabel(slot: string, type: string | undefined): string {
  if (!type || !SLOTS_WITH_ITEM_TYPES.has(slot)) {
    return '';
  }
  const words = type.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1));
  const last = words[words.length - 1]!;
  words[words.length - 1] = ITEM_TYPE_SINGULARS[last] ?? singular(last);
  return words.join(' ');
}

function singular(word: string): string {
  if (/(sh|ch)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (/[^s]s$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}
