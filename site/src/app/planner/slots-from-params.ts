import { CRAFT_KEY_PREFIX, getMlSlotFromKey, isCraftKey, isMlKey, ML_KEY_PREFIX, parseCraftKey } from '../build/build-param-keys';
import type { ParamsAdapter } from '../build/query-params.service';
import { findAugmentUpgradeForLegacySlot } from '../gear/augment-slots';
import type { EssenceCraftingService } from '../gear/essence-crafting.service';
import { canonicalizeCraftingSystemName, GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';

/** A main hand that leaves no room for an offhand: a two-hander, bar a crossbow. */
export function emptiesOffhand(mainHand: Item | null): boolean {
  return !!mainHand && mainHand.isTwoHandedWeapon() && !mainHand.isCrossbow();
}

/** A main hand that leaves room only for a rune arm: a two-handed crossbow. */
export function limitsOffhandToRuneArms(mainHand: Item | null): boolean {
  return !!mainHand && mainHand.isTwoHandedWeapon() && mainHand.isCrossbow();
}

/**
 * The items a build's params put in each slot: a copy of each item they
 * name, at its minimum level, with its crafting chosen. Every slot is in the
 * map, null when empty - including one naming an item the data doesn't
 * have, and an offhand the main hand leaves no room for.
 *
 * Pure: the planner equips what it returns, and a friend's still-needed
 * page reads a build's gear without loading it into the planner.
 */
export function slotsFromParams(params: ParamsAdapter, gearDb: Pick<GearDbService, 'getSlots' | 'findGearBySlot'>,
    essenceCrafting: Pick<EssenceCraftingService, 'setItemToML'>): Map<string, Item | null> {
  const slotNames = gearDb.getSlots();
  const slots = new Map<string, Item | null>(slotNames.map(slot => [slot, null]));
  const craftingParams: Array<Record<string, string> | undefined> = [];
  const minLevels = new Map<string, number>();

  for (const key of params.keys) {
    if (isCraftKey(key)) {
      const { index, field } = parseCraftKey(key)!;
      craftingParams[index] ??= {};
      // key comes from params.keys, so get() finds it
      craftingParams[index][field] = params.get(key) ?? '';
    } else if (slotNames.includes(key)) {
      const itemName = params.get(key);
      if (!itemName) {
        // A slot key with a falsy value means "empty", same as the key being
        // absent. Also guards against ever passing null/'' into
        // findGearBySlot -> canonicalizeGeneratedCraftedItemName, which
        // assumes a real string.
        continue;
      }
      const item = gearDb.findGearBySlot(key, itemName);
      if (item) {
        slots.set(item.slot, item);
      } else {
        console.log('Can\'t find ' + itemName + ' for slot ' + key);
      }
    } else if (isMlKey(key)) {
      minLevels.set(getMlSlotFromKey(key)!, Number(params.get(key)));
    } else if (key.startsWith(CRAFT_KEY_PREFIX)) {
      console.log('Bad crafting key: ' + key);
    } else if (key.startsWith(ML_KEY_PREFIX)) {
      console.log('Bad ml key: ' + key);
    }
  }

  for (const [slot, ml] of minLevels) {
    const item = slots.get(slot);
    if (item?.isEssenceCrafted()) {
      essenceCrafting.setItemToML(item, ml);
    } else if (item) {
      item.ml = ml;
    }
  }

  for (const craftingParam of craftingParams) {
    if (craftingParam) {
      applyCraftingParam(slots, craftingParam);
    }
  }

  const offhand = slots.get('Offhand');
  const mainHand = slots.get('Weapon') ?? null;
  if (offhand && (emptiesOffhand(mainHand) || (limitsOffhandToRuneArms(mainHand) && !offhand.isRuneArm()))) {
    slots.set('Offhand', null);
  }
  return slots;
}

function applyCraftingParam(slots: ReadonlyMap<string, Item | null>, craftingParam: Record<string, string>): void {
  const item = slots.get(craftingParam['slot']);
  if (!item) {
    console.log('Couldn\'t set craftable. No item in ' + craftingParam['slot']);
    return;
  }
  let crafting = item.getCraftingByName(canonicalizeCraftingSystemName(craftingParam['system']));
  let selected = craftingParam['selected'];
  if (!crafting) {
    const upgrade = findAugmentUpgradeForLegacySlot(item, craftingParam['system'], selected);
    crafting = upgrade?.craftable;
    selected = upgrade?.selection ?? selected;
  }
  if (!crafting) {
    console.log('Couldn\'t set craftable. No system called ' + craftingParam['system']);
    return;
  }
  if (!crafting.selectByParamDescription(selected)) {
    console.log('Couldn\'t set craftable. Couldn\'t find option matching ' + craftingParam['selected']);
  }
}
