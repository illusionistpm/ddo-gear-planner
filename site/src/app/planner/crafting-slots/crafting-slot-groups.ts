import {
  AUGMENT_SLOT_1, AUGMENT_SLOT_2, isAugmentSystemName, isAugmentUpgradeSystemName, isCraftingSlotAvailable,
  normalizeAugmentSlots
} from '../../gear/augment-slots';
import { Craftable } from '../../gear/craftable';
import { Item } from '../../gear/item';
import { sortSlotsForDisplay } from '../../gear/slot-display';

/**
 * Slots that can become one of several colours: an essence-crafted item's two
 * augment slots and the Necropolis 4 / Vol augment upgrades. They're grouped
 * apart from the fixed colours, and stay in that group whatever colour they're
 * given, so a row doesn't jump to another group while it's being edited.
 */
export const FLEXIBLE_AUGMENT_GROUP = 'Flexible augment slots';

export interface CraftingSlotRow {
  /** Stable across edits, for tracking: the gear slot, the slot's name and its occurrence on the item. */
  key: string;
  gearSlot: string;
  item: Item;
  craft: Craftable;
  empty: boolean;
}

export interface CraftingSlotGroup {
  name: string;
  rows: CraftingSlotRow[];
  empty: number;
}

/** One coloured augment slot type (or the flexible ones) at a glance. */
export interface CraftingSlotSummary {
  /** "Sun", "Blue", "Flexible". */
  label: string;
  groupName: string;
  total: number;
  empty: number;
}

export interface CraftingSlotOverview {
  groups: CraftingSlotGroup[];
  summary: CraftingSlotSummary[];
}

export function craftingSlotGroupName(craft: Craftable): string {
  return craft.name === AUGMENT_SLOT_1 || craft.name === AUGMENT_SLOT_2 || isAugmentUpgradeSystemName(craft.name)
    ? FLEXIBLE_AUGMENT_GROUP
    : craft.name;
}

/** Nothing chosen yet: no system for a slot that picks one first, or no option in it. */
export function isCraftingSlotEmpty(craft: Craftable): boolean {
  return !craft.selected?.getParamDescription();
}

/**
 * Every usable crafting slot on the equipped gear, grouped by slot type and
 * sorted by its name, each row naming the gear slot and item it's on.
 *
 * Brings each item's Augment Slot 2 in line with slot 1 first, as the gear
 * card does before showing them (normalizeAugmentSlots).
 */
export function deriveCraftingSlotOverview(slots: ReadonlyMap<string, Item | null>): CraftingSlotOverview {
  const groups = new Map<string, CraftingSlotGroup>();
  for (const gearSlot of sortSlotsForDisplay(Array.from(slots.keys()))) {
    const item = slots.get(gearSlot);
    if (!item?.crafting?.length) {
      continue;
    }
    normalizeAugmentSlots(item);
    const occurrences = new Map<string, number>();
    for (const craft of item.crafting) {
      const occurrence = (occurrences.get(craft.name) ?? 0) + 1;
      occurrences.set(craft.name, occurrence);
      if (!isCraftingSlotAvailable(item, craft)) {
        continue;
      }
      const name = craftingSlotGroupName(craft);
      let group = groups.get(name);
      if (!group) {
        group = { name, rows: [], empty: 0 };
        groups.set(name, group);
      }
      const empty = isCraftingSlotEmpty(craft);
      group.rows.push({ key: `${gearSlot}|${craft.name}#${occurrence}`, gearSlot, item, craft, empty });
      if (empty) {
        group.empty++;
      }
    }
  }

  const sorted = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  const summary = sorted
    .filter(group => isAugmentSystemName(group.name) || group.name === FLEXIBLE_AUGMENT_GROUP)
    .map(group => ({
      label: group.name === FLEXIBLE_AUGMENT_GROUP ? 'Flexible' : group.name.replace(/ Augment Slot$/, ''),
      groupName: group.name,
      total: group.rows.length,
      empty: group.empty
    }));
  return { groups: sorted, summary };
}
