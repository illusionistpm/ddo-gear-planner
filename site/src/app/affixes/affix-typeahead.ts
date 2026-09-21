import { AffixService } from './affix.service';
import { TypeaheadEntry } from '../typeahead/typeahead.component';

/** Affix names as typeahead entries, so a search also matches an affix by its synonyms. */
export function buildAffixTypeaheadEntries(affixNames: string[], affixSvc: AffixService): TypeaheadEntry[] {
  return affixNames.map(name => ({ name, synonyms: affixSvc.getSynonyms(name) }));
}
