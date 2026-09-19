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
