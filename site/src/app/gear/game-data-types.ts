/**
 * Shapes of the generated game-data JSON in data/ (written by
 * data-builder/), and of the init objects the model constructors accept.
 */

/** An affix as it appears in the data. Values are often strings like "+1". */
export interface RawAffix {
  name: string;
  /**
   * Missing on a few dozen affixes the parser couldn't type (requirement text such as
   * "Required Trait: Lawful (UMD"). TypeScript only noticed once items lost 'pack',
   * which changed how it unifies the items.json literal; the Affix constructor already
   * copes.
   */
  type?: string;
  value: number | string;
}

/** What the Affix constructor accepts: raw data, another Affix, or a partial. */
export type AffixInit = Partial<RawAffix>;

export interface CraftableOptionInit {
  affixes?: ReadonlyArray<AffixInit>;
  set?: string;
  name?: string;
  ml?: number;
  quests?: ReadonlyArray<string>;
}

/** A crafting slot passed to the Item constructor as a plain object (tests do this). */
export interface CraftableInit {
  name: string;
  options?: CraftableOptionInit[];
}

/** One entry of items.json. `crafting` lists crafting system names. */
export interface RawItem {
  name: string;
  slot: string;
  type?: string;
  ml: number;
  affixes?: RawAffix[];
  crafting?: string[];
  /** An augment upgrade's crafting system -> the augment colours it can become. */
  augmentUpgrades?: Record<string, string[]>;
  sets?: string[];
  quests?: string[];
  url?: string;
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
  /**
   * A dual option ("Watchful", Heightened Awareness + Dodge) -> each affix it grants ->
   * that affix's value at each minimum level, as `progression`. Such an option has no
   * `progression` entry: its affixes scale separately. Their bonus types are in `bonusTypes`.
   */
  compounds?: Record<string, Record<string, number[]>>;
}

/** One filigree in filigree.json, keyed by its wiki name ("Celerity: Dexterity"). */
export interface RawFiligree {
  /** Its set; a raid filigree ("Celerity / Zephyr") belongs to two and counts toward both. */
  sets: string[];
  /** A key of RawFiligreeData.generations: "1", "2 raid", "event". */
  generation: string;
  affixes: RawAffix[];
  /** What the (Rare) copy adds on top of `affixes`. */
  rareAffixes: RawAffix[];
}

export interface RawFiligreeSet {
  /** A rarer set ("Zephyr (Rare)" on the wiki); the name drops the suffix. */
  rare: boolean;
  /** Cumulative: every tier at or below the piece count applies. */
  bonuses: RawSetTier[];
}

export interface RawFiligreeGeneration {
  /** Adventure packs (quests.json names, or the Events pseudo-pack) whose chests drop it. */
  packs: string[];
  /** Set for raid filigrees: what they're bought with, rather than where they drop. */
  source?: string;
}

/** filigree.json. */
export interface RawFiligreeData {
  filigrees: Record<string, RawFiligree>;
  sets: Record<string, RawFiligreeSet>;
  generations: Record<string, RawFiligreeGeneration>;
}
