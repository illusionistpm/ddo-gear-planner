import {
  ALL_WEAPON_TYPES, ARMOR_TYPES, MELEE_WEAPON_TYPES, OFFHAND_TYPES, RANGED_WEAPON_TYPES, TWO_HANDED_WEAPON_TYPES
} from '../gear/item-type-groups';

/**
 * The guided setup's answers, and the build they make. Pure: the start page
 * applies a plan to the planner's services, and the specs check it here.
 */

export type BuildRole = 'melee' | 'ranged' | 'caster';
export type TranceChoice = 'none' | 'partial' | 'full';

export interface NewBuildAnswers {
  role: BuildRole | null;
  trapping: boolean;
  /** 'endgame' is the last levels before the cap; a range is the player's own. */
  level: 'endgame' | [number, number];
  /** Whether gear from raids, and rare gear, is shown. */
  showRaid: boolean;
  showRare: boolean;
  /** Packs whose gear is hidden, as the item filter keys them; [] shows every pack. */
  hiddenPacks: string[];
  /** Weapon types allowed; null keeps the role's default (every melee, or every ranged and thrown, type). */
  weaponTypes: string[] | null;
  /** Offhand types allowed; null allows them all. [] is "a second weapon": no shields, orbs or rune arms. */
  offhandTypes: string[] | null;
  /** Armor types allowed, Docents included; null allows them all. */
  armorTypes: string[] | null;
  /** The ability scores the build wants. Constitution isn't among the choices: Basic tracks it. */
  abilities: string[];
  spellpowers: string[];
  schools: string[];
  tactics: string[];
  trance: TranceChoice;
  /** The final value of the ability score the trance keys off; null for TRANCE_DEFAULT_ABILITY. */
  tranceAbility: number | null;
  /** A Legendary Green Steel effect, by its element ("Dust"), or null for none. */
  greenSteel: string | null;
  /** Opt-in procs (DAMAGE_BOOSTS), for melee and ranged. */
  damageBoosts: string[];
  /** The minor artifact chosen, to equip again after a reload; null to decide in the planner. */
  artifact: { name: string; slot: string } | null;
}

export const ATTRIBUTES = ['Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma'];
export const SPELL_SCHOOLS = ['Evocation', 'Transmutation', 'Abjuration', 'Conjuration', 'Enchantment', 'Illusion', 'Necromancy'];
export const TACTICS = ['Stunning', 'Sundering', 'Vertigo'];

/** The Legendary Green Steel effects endgame builds usually pick from, by role. */
export function greenSteelChoices(role: BuildRole | null): string[] {
  return role === 'caster' ? ['Ash', 'Ooze', 'Vacuum'] : ['Dust', 'Ooze', 'Vacuum'];
}

export const greenSteelAffix = (element: string) => `Legendary ${element}`;

/**
 * Where "endgame" starts. Its top is the cap, the highest item level in the data, so new
 * gear moves it; the bottom stays here.
 */
export const ENDGAME_MIN_LEVEL = 30;
/** Where a levelling range starts when first chosen. */
export const LEVELLING_RANGE: [number, number] = [1, 20];

export const TRANCE_LABEL = 'Trance';
/** A trance's ability score when the player doesn't say: high enough at cap that the exact value hardly matters. */
export const TRANCE_DEFAULT_ABILITY = 70;

/** A trance's Insight Deadly from the ability score it keys off: (score - 10) / 4, rounded down. */
export function tranceDeadlyFor(ability: number): number {
  return Math.max(0, Math.floor((ability - 10) / 4));
}

export function emptyAnswers(): NewBuildAnswers {
  return {
    role: null,
    trapping: false,
    level: 'endgame',
    showRaid: true,
    showRare: true,
    hiddenPacks: [],
    weaponTypes: null,
    offhandTypes: null,
    armorTypes: null,
    abilities: [],
    spellpowers: [],
    schools: [],
    tactics: [],
    trance: 'none',
    tranceAbility: null,
    greenSteel: null,
    damageBoosts: [],
    artifact: null
  };
}

/**
 * Answers for a newly chosen role: what depends on the role starts over at
 * its defaults, and the rest (level, gear sources, armor, trapping) stays.
 */
export function withRole(answers: NewBuildAnswers, role: BuildRole, healer = false): NewBuildAnswers {
  const martial = role !== 'caster';
  return {
    ...answers,
    role,
    weaponTypes: null,
    offhandTypes: null,
    abilities: role === 'melee' ? ['Strength'] : role === 'ranged' ? ['Dexterity'] : healer ? ['Wisdom'] : [],
    spellpowers: role === 'caster' && healer ? ['Healing'] : [],
    schools: [],
    tactics: [],
    trance: martial ? 'partial' : 'none',
    greenSteel: null,
    damageBoosts: []
  };
}

export interface PlanContext {
  packages: ReadonlyMap<string, ReadonlyArray<string>>;
  spellpowerPackages: ReadonlyMap<string, ReadonlyArray<string>>;
  /** The highest item level in the data: the cap. */
  maxLevel: number;
}

export interface PlannedExternal {
  affixName: string;
  bonusType: string;
  /** null: covered elsewhere - the scorer stops chasing this bonus type. */
  value: number | null;
}

export interface NewBuildPlan {
  tracked: string[];
  levelRange: [number, number];
  showRaid: boolean;
  showRare: boolean;
  hiddenPacks: Set<string>;
  hiddenTypes: Set<string>;
  /** Non-gear entries, all labelled TRANCE_LABEL. */
  externals: PlannedExternal[];
}

export function levelRangeOf(answers: NewBuildAnswers, maxLevel: number): [number, number] {
  if (answers.level === 'endgame') {
    return [Math.min(ENDGAME_MIN_LEVEL, maxLevel), maxLevel];
  }
  return answers.level;
}

export function planFromAnswers(answers: NewBuildAnswers, context: PlanContext): NewBuildPlan {
  const tracked: string[] = [];
  const add = (affixes: Iterable<string> | undefined) => {
    for (const affix of affixes ?? []) {
      if (!tracked.includes(affix)) {
        tracked.push(affix);
      }
    }
  };

  add(context.packages.get('Basic'));
  const role = answers.role;
  if (role === 'melee') {
    add(context.packages.get('Melee'));
  } else if (role === 'ranged') {
    add(context.packages.get('Ranged'));
  } else if (role === 'caster') {
    add(context.packages.get('Caster'));
  }
  if (answers.trapping) {
    add(context.packages.get('Trapping'));
  }
  for (const spellpower of role === 'caster' ? answers.spellpowers : []) {
    add(context.spellpowerPackages.get(spellpower));
  }
  if (role === 'caster') {
    add(answers.schools.map(school => `${school} Focus`));
  }
  if (role === 'melee') {
    add(answers.tactics);
  }
  add(answers.abilities);
  if (answers.greenSteel) {
    add([greenSteelAffix(answers.greenSteel)]);
  }
  if (role === 'melee' || role === 'ranged') {
    add(answers.damageBoosts);
  }

  return {
    tracked,
    levelRange: levelRangeOf(answers, context.maxLevel),
    showRaid: answers.showRaid,
    showRare: answers.showRare,
    hiddenPacks: new Set(answers.hiddenPacks),
    hiddenTypes: hiddenTypesOf(answers),
    externals: tranceExternals(answers)
  };
}

/** The weapon types a melee or ranged build allows; null for a caster or no role, who aren't filtered. */
function allowedWeapons(answers: NewBuildAnswers): ReadonlyArray<string> | null {
  if (answers.role !== 'melee' && answers.role !== 'ranged') {
    return null;
  }
  return answers.weaponTypes ?? (answers.role === 'melee' ? MELEE_WEAPON_TYPES : RANGED_WEAPON_TYPES);
}

/** Every weapon allowed is two-handed (a greatsword, a bow): the off hand is empty, so it isn't filtered. */
export function isTwoHandedOnly(answers: NewBuildAnswers): boolean {
  const allowed = allowedWeapons(answers);
  return !!allowed && allowed.length > 0 && allowed.every(type => TWO_HANDED_WEAPON_TYPES.includes(type));
}

function hiddenTypesOf(answers: NewBuildAnswers): Set<string> {
  const hidden = new Set<string>();
  const allowWeapons = allowedWeapons(answers);
  const hideAllBut = (all: ReadonlyArray<string>, allowed: ReadonlyArray<string> | null) => {
    if (allowed) {
      all.filter(type => !allowed.includes(type)).forEach(type => hidden.add(type));
    }
  };
  // A caster's weapon is whatever carries their stats: no weapon filter for them.
  hideAllBut(ALL_WEAPON_TYPES, allowWeapons);
  hideAllBut(OFFHAND_TYPES, isTwoHandedOnly(answers) ? null : answers.offhandTypes);
  hideAllBut(ARMOR_TYPES, answers.armorTypes);
  return hidden;
}

function tranceExternals(answers: NewBuildAnswers): PlannedExternal[] {
  if (answers.role === 'caster' || answers.role === null || answers.trance === 'none') {
    return [];
  }
  const deadly = tranceDeadlyFor(answers.tranceAbility ?? TRANCE_DEFAULT_ABILITY);
  const externals: PlannedExternal[] = [{ affixName: 'Deadly', bonusType: 'Insight', value: deadly }];
  if (answers.trance === 'full') {
    // A full trance also gives Insight Accuracy and tactics DCs; their values vary too much
    // to guess, so they're marked as covered, which is what matters to the suggestions.
    externals.push({ affixName: 'Accuracy', bonusType: 'Insight', value: null });
    for (const tactic of answers.role === 'melee' ? answers.tactics : []) {
      externals.push({ affixName: tactic, bonusType: 'Insight', value: null });
    }
  }
  return externals;
}
