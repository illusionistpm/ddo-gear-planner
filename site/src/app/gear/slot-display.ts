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

/** The key into SLOT_ICON_PATHS for a slot, or undefined when it has no icon. */
export function slotIcon(slot: string): string | undefined {
  return SLOT_ICONS[slot];
}

/** A slot's name for display: "Ring1" reads as "Ring 1". */
export function slotLabel(slot: string): string {
  return slot.replace(/^(\D+)(\d+)$/, '$1 $2');
}
