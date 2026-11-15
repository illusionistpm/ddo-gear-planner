import { convertToParamMap } from '@angular/router';

import type { Affix } from '../affixes/affix';
import type { AffixService } from '../affixes/affix.service';
import { BuildView, countSets, setBonusesOf } from '../affixes/build-totals';
import { ExternalAffixEntry, externalAffixAsAffix, parseExternalAffixEntries } from '../affixes/external-affix';
import { expandTrackedAffixNames } from '../affixes/tracked-affix-family';
import { FILIGREE_KEY, NONGEAR_KEY, TRACKED_KEY } from '../build/build-param-keys';
import type { BuildUrlCodecService } from '../build/build-url-codec.service';
import type { EssenceCraftingService } from '../gear/essence-crafting.service';
import { CountedFiligree, FiligreeLoadout } from '../gear/filigree';
import type { FiligreeDbService } from '../gear/filigree-db.service';
import type { GearDbService } from '../gear/gear-db.service';
import type { ItemBonusService } from '../gear/item-bonus.service';
import type { Item } from '../gear/item';
import type { VisibleSetBonus } from './equipped.service';
import {
  countLoadoutFiligree, FiligreeContribution, filigreeContributionsFor, filigreeContributionsOf, filigreeSetPiecesOf,
  findFiligreeHosts
} from './filigree-loadout';
import { parseFiligreeLoadout } from './filigree-params';
import { slotsFromParams } from './slots-from-params';

/** A saved build, read from its blob without loading it into the planner. */
export interface BuildSnapshot {
  /** Every slot, null when empty. */
  slots: Map<string, Item | null>;
  filigreeLoadout: FiligreeLoadout;
  externalEntries: ExternalAffixEntry[];
  /** The affixes it tracks, expanded as the planner expands them. */
  tracked: Set<string>;
  /** Items it names that the game data no longer has: their slots read as empty. */
  unknownItems: Array<{ slot: string; name: string }>;
}

export interface SnapshotDeps {
  codec: Pick<BuildUrlCodecService, 'decode'>;
  gearDb: Pick<GearDbService, 'getSlots' | 'findGearBySlot'>;
  essenceCrafting: Pick<EssenceCraftingService, 'setItemToML'>;
  filigreeDb: Pick<FiligreeDbService, 'get'>;
  affixSvc: Pick<AffixService, 'getCanonicalName'>;
  /** To read the items' Mythic Boosts, Reaper bonuses and Curses; without it they're left off. */
  itemBonuses?: Pick<ItemBonusService, 'find'>;
}

/** A saved build's gear and choices, from its blob; null for a blob this client can't read. */
export function snapshotFromBlob(blob: string, deps: SnapshotDeps): BuildSnapshot | null {
  const decoded = deps.codec.decode(blob);
  if (!decoded) {
    return null;
  }
  const params = convertToParamMap(decoded);
  const slots = slotsFromParams(params, deps.gearDb, deps.essenceCrafting, deps.itemBonuses);
  const unknownItems: BuildSnapshot['unknownItems'] = [];
  for (const [slot, item] of slots) {
    const name = params.get(slot);
    // An emptied offhand behind a two-hander is still in the data; only a missing item is unknown.
    if (!item && name && !deps.gearDb.findGearBySlot(slot, name)) {
      unknownItems.push({ slot, name });
    }
  }
  return {
    slots,
    filigreeLoadout: parseFiligreeLoadout(params.get(FILIGREE_KEY), name => !!deps.filigreeDb.get(name)),
    externalEntries: parseExternalAffixEntries(params.get(NONGEAR_KEY), deps.affixSvc),
    tracked: expandTrackedAffixNames(params.getAll(TRACKED_KEY), deps.affixSvc),
    unknownItems,
  };
}

/** A snapshot with what its gear adds up to worked out once: the BuildView the stacking rules read. */
export interface BuildModel extends BuildView {
  snapshot: BuildSnapshot;
  /** Gear sets, then filigree sets, with their pieces and tiers, as the planner lists them. */
  sets: VisibleSetBonus[];
  /** The filigrees that count, both hosts. */
  countedFiligree: CountedFiligree[];
  /** Everything the filigrees and filigree sets give. */
  filigree: FiligreeContribution[];
}

export interface BuildModelDeps {
  gearDb: Pick<GearDbService, 'getSetBonus' | 'getSetBonusThresholdDetails'>;
  filigreeDb: Pick<FiligreeDbService, 'getAffixes' | 'getSets' | 'getSetBonus' | 'getSetTiers'>;
  affixSvc: Pick<AffixService, 'flattenAffixGroups'>;
}

export function buildModelOf(snapshot: BuildSnapshot, deps: BuildModelDeps): BuildModel {
  const countedFiligree = countLoadoutFiligree(snapshot.filigreeLoadout, findFiligreeHosts(snapshot.slots));
  const { setBonuses, visibleSets: sets } = setBonusesOf(countSets(snapshot.slots),
    filigreeSetPiecesOf(countedFiligree, deps.filigreeDb), deps.gearDb, deps.filigreeDb);
  const filigree = filigreeContributionsOf(countedFiligree, deps.filigreeDb, deps.affixSvc);
  return {
    snapshot,
    sets,
    countedFiligree,
    filigree,
    items: () => snapshot.slots,
    setBonuses: () => setBonuses,
    externalEntries: () => snapshot.externalEntries,
    filigreeFor: (affixName, bonusType) => filigreeContributionsFor(filigree, affixName, bonusType),
  };
}

/**
 * Every affix the build's gear, sets, filigree and non-gear entries give something to, affix
 * groups as their members (a group itself is left out: its members carry its value).
 */
export function contributedAffixNames(model: BuildModel, affixSvc: Pick<AffixService, 'getActiveAffixes'
    | 'flattenAffixGroups' | 'isAffixGroup'>): Set<string> {
  const affixes: Affix[] = [];
  for (const item of model.snapshot.slots.values()) {
    if (item) {
      affixes.push(...affixSvc.getActiveAffixes(item));
    }
  }
  for (const [, bonuses] of model.setBonuses()) {
    affixes.push(...affixSvc.flattenAffixGroups(bonuses));
  }
  affixes.push(...model.filigree.map(entry => entry.affix));
  affixes.push(...affixSvc.flattenAffixGroups(model.snapshot.externalEntries
    .filter(entry => entry.kind === 'value').map(externalAffixAsAffix)));
  const names = new Set<string>();
  for (const affix of affixes) {
    if (!affixSvc.isAffixGroup(affix)) {
      names.add(affix.name);
    }
  }
  return names;
}
