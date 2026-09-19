/**
 * Shapes of the generated game-data JSON in src/assets (written by
 * data-builder/), and of the init objects the model constructors accept.
 */

/** An affix as it appears in the data. Values are often strings like "+1". */
export interface RawAffix {
  name: string;
  type: string;
  value: number | string;
}

/** What the Affix constructor accepts: raw data, another Affix, or a partial. */
export type AffixInit = Partial<RawAffix>;

export interface CraftableOptionInit {
  affixes?: AffixInit[];
  set?: string;
  name?: string;
  ml?: number;
  quests?: string[];
}

/** A crafting slot passed to the Item constructor as a plain object (tests do this). */
export interface CraftableInit {
  name: string;
  options?: CraftableOptionInit[];
  hiddenFromAffixSearch?: boolean;
}

/** One entry of items.json. `crafting` lists crafting system names. */
export interface RawItem {
  name: string;
  slot: string;
  type?: string;
  ml: number;
  affixes?: RawAffix[];
  crafting?: string[];
  sets?: string[];
  quests?: string[];
  url?: string;
  pack?: string;
  rare?: boolean;
  artifact?: boolean;
}

/** crafting.json: crafting system -> item name (or "*") -> options. */
export type RawCraftingData = Record<string, Record<string, CraftableOptionInit[]>>;

export interface RawSetTier {
  threshold: number;
  affixes: RawAffix[];
}

/** sets.json: set name -> bonus tiers. */
export type RawSetData = Record<string, RawSetTier[]>;

/** essence-crafting.json. */
export interface RawEssenceCraftingData {
  /** Essence option name -> bonus type. */
  bonusTypes: Record<string, string>;
  /** Item type -> slot (Prefix/Suffix/Extra) -> option names. */
  itemTypes: Record<string, Record<string, string[]>>;
  maxLevel: number;
  /**
   * Option name -> value at each minimum level, index ML - 1. Always numeric:
   * the builder emits 1 for checklist options the wiki lists with dice.
   */
  progression: Record<string, number[]>;
  /** Option name -> the affix name(s) it grants, when different from the option name. */
  affixes?: Record<string, string | string[]>;
}
