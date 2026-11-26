import { Item } from '../gear/item';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from './equipped.service';
import { withSuggestedCrafting } from './suggestion-scorer';

/** A minor artifact as a candidate for the build's one, scored in the slot it would take. */
export interface RankedArtifact {
  slot: string;
  score: number;
  /** A copy with the crafting the scorer counted already selected (see withSuggestedCrafting). */
  item: Item;
}

/**
 * The build's candidate minor artifacts across every slot, best first. Each slot's scorer takes
 * out what the slot holds, as its drawer does, so scores compare across slots. Scoring a slot
 * costs up to ~90ms, so slots are scored one per macrotask, keeping the page responsive; a
 * cancelled run (`isCancelled` turning true) resolves with what it has.
 */
export async function rankArtifacts(
  equipped: EquippedService,
  gearDB: GearDbService,
  isCancelled: () => boolean = () => false
): Promise<RankedArtifact[]> {
  const ranked: RankedArtifact[] = [];
  const seen = new Set<string>();
  for (const slot of gearDB.getSlots()) {
    if (isCancelled()) {
      break;
    }
    const candidates = equipped.getCompatibleGearForSlot(slot, gearDB.getFilteredGearBySlot(slot) ?? [])
      .filter(item => item.artifact && !seen.has(item.name));
    if (!candidates.length) {
      continue;
    }
    await new Promise<void>(resolve => setTimeout(resolve));
    if (isCancelled()) {
      break;
    }
    const scorer = equipped.getSuggestionScorer(slot);
    for (const item of candidates) {
      // Rings fit either ring slot: list each once.
      seen.add(item.name);
      ranked.push({ slot, score: scorer(item), item: withSuggestedCrafting(item, scorer.suggestedCrafting(item)) });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}
