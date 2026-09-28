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

/** A slot's name for display: "Ring1" reads as "Ring 1". */
export function slotLabel(slot: string): string {
  return slot.replace(/^(\D+)(\d+)$/, '$1 $2');
}
