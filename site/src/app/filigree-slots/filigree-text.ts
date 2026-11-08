import { Affix } from '../affixes/affix';

/** "Dexterity +1, Physical Sheltering +2"; an on/off effect is just its name. */
export function describeFiligreeAffixes(affixes: ReadonlyArray<Affix>): string {
  return affixes.map(affix => Affix.isRealType(affix.type)
    ? `${affix.name} ${affix.value > 0 ? '+' : ''}${affix.value}`
    : affix.name).join(', ');
}

/** The filigree's own part of its name: "Celerity: Dexterity" is "Dexterity" within the Celerity set. */
export function filigreeShortName(name: string): string {
  const colon = name.indexOf(': ');
  return colon >= 0 ? name.slice(colon + 2) : name;
}
