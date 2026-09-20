import { MAX_FILIGREE_SLOTS_AFFIX } from './filigree-affix';

/**
 * Affixes whose value counts something rather than adding a bonus (Max Filigree Slots). They carry a
 * placeholder bonus type in the data, so everything that would print or act on that type - the value text,
 * the tracked chip label, the drawer title, the non-gear panel - checks here instead. Add an entry to make
 * another affix behave the same way; the value is the unit shown after the number.
 */
const COUNT_AFFIX_UNITS = new Map<string, string>([
  [MAX_FILIGREE_SLOTS_AFFIX, 'slots']
]);

export function isCountAffix(affixName: string): boolean {
  return COUNT_AFFIX_UNITS.has(affixName);
}

/** "slots" for Max Filigree Slots, or undefined for an ordinary affix. */
export function getCountAffixUnit(affixName: string): string | undefined {
  return COUNT_AFFIX_UNITS.get(affixName);
}

/** The unit, capitalised, for the affix's chip in the tracked list: "Slots". */
export function getCountAffixChipLabel(affixName: string): string | undefined {
  const unit = getCountAffixUnit(affixName);
  return unit && unit.charAt(0).toUpperCase() + unit.slice(1);
}
