import { CraftableOption } from './craftable-option';

/**
 * Tiers of one crafting option: every option in a list that grants exactly the
 * same affixes (name and bonus type), differing only in value and ML - e.g.
 * "Diamond of Charisma +1" through "+15". Long augment lists are mostly such
 * tiers, so a picker can offer one entry per family and the value separately.
 */
export interface CraftingOptionFamily {
  key: string;
  label: string;
  /** Lowest value first; ties by ML. */
  tiers: CraftableOption[];
}

/**
 * Groups a crafting list into families, named for what they grant and sorted
 * by that name, the empty option first. Options with no affixes (the empty
 * option, set augments) are families of their own.
 */
export function groupCraftingOptions(options: CraftableOption[]): CraftingOptionFamily[] {
  const families = new Map<string, CraftingOptionFamily>();
  for (const option of options) {
    const key = familyKey(option);
    const family = families.get(key);
    if (family) {
      family.tiers.push(option);
    } else {
      families.set(key, { key, label: '', tiers: [option] });
    }
  }

  const result = Array.from(families.values());
  for (const family of result) {
    family.tiers.sort((a, b) => totalValue(a) - totalValue(b) || a.ml - b.ml);
    family.label = familyLabel(family.tiers[0]);
  }
  // The key (affix names, then types) orders families sharing a name: Charisma Enhancement, then Insight.
  return result.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function familyKey(option: CraftableOption): string {
  if (!option.affixes.length) {
    return 'option:' + option.getParamDescription();
  }
  return 'affixes:' + option.affixes.map(affix => affix.name + '|' + affix.type).sort().join('||');
}

function totalValue(option: CraftableOption): number {
  return option.affixes.reduce((sum, affix) => sum + affix.value, 0);
}

/**
 * What a family grants: its affixes' names, or its set for a set augment. The
 * bonus types and values are left to the picker, which shows them alongside.
 */
function familyLabel(option: CraftableOption): string {
  if (option.affixes.length) {
    return option.affixes.map(affix => affix.name).join(', ');
  }
  return option.set ? `${option.set} set` : option.describe();
}
