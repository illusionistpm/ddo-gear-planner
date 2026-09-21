import { Affix } from './affix';

/**
 * A tracked-affix contribution from outside the gear planner (a spell, a
 * past life, ...), or a bonus type the player chose to ignore. Stored in the
 * build URL's `ext` param.
 */
export interface ExternalAffixEntry {
  id: string;
  affixName: string;
  bonusType: string;
  kind: 'value' | 'ignored';
  value: number;
  label: string;
}

/** What the Non-gear card and the equipment sidebar's Non-gear entry are for. */
export const NON_GEAR_DESCRIPTION = 'Bonuses gear could provide but you get elsewhere, like Greater Heroism or a trance.';

/**
 * Validates an entry parsed from the URL. `requireId` is false for the codec,
 * which encodes entries positionally and drops their ids.
 */
export function isExternalAffixEntry(value: unknown, requireId: false): value is Omit<ExternalAffixEntry, 'id'>;
export function isExternalAffixEntry(value: unknown, requireId?: true): value is ExternalAffixEntry;
export function isExternalAffixEntry(value: unknown, requireId = true): boolean {
  const entry = value as Record<string, unknown> | null;
  return !!entry && typeof entry === 'object'
    && (!requireId || typeof entry.id === 'string')
    && typeof entry.affixName === 'string'
    && typeof entry.bonusType === 'string'
    && (entry.kind === 'value' || entry.kind === 'ignored')
    && typeof entry.value === 'number'
    && typeof entry.label === 'string';
}

/** The entry as an Affix, so it can be valued and ranked like gear affixes. */
export function externalAffixAsAffix(entry: ExternalAffixEntry): Affix {
  return new Affix({ name: entry.affixName, type: entry.bonusType, value: entry.value });
}

/** A checklist affix (Bool bonus type) the player has recorded as covered, as opposed to ignored. */
export function isCoveredExternalAffix(entry: ExternalAffixEntry): boolean {
  return entry.kind === 'value' && entry.bonusType === 'Bool';
}
