import type { AffixService } from './affix.service';

/** Affixes tracked along with another: tracking Armor Class tracks Armor Class (%) too. */
export const TRACKED_AFFIX_COMPANIONS = new Map<string, Array<string>>([
  ['Armor Class', ['Armor Class (%)']],
  ['False Life', ['False Life (%)']],
]);

/** What tracking these affixes actually tracks: each one by its canonical name, along with its companions. */
export function expandTrackedAffixNames(affixes: Iterable<string>, affixSvc: Pick<AffixService, 'getCanonicalName'>): Set<string> {
  const expanded = new Set<string>();
  for (const affix of affixes) {
    const canonicalAffix = affixSvc.getCanonicalName(affix);
    expanded.add(canonicalAffix);
    for (const companion of TRACKED_AFFIX_COMPANIONS.get(canonicalAffix) || []) {
      expanded.add(companion);
    }
  }
  return expanded;
}
