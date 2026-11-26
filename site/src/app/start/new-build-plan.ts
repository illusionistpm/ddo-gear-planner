import {
  ALL_WEAPON_TYPES, ARMOR_TYPES, MELEE_WEAPON_TYPES, OFFHAND_TYPES, RANGED_WEAPON_TYPES
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
  /** Weapon types allowed; null keeps the role's default (every melee, or every ranged and thrown, type). */
  weaponTypes: string[] | null;
  /** Offhand types allowed; null allows them all, [] none (two-handers, or nothing in the off hand). */
  offhandTypes: string[] | null;
  /** Armor types allowed, Docents included; null allows them all. */
  armorTypes: string[] | null;
  mainStat: string | null;
  otherStats: string[];
  spellpowers: string[];
  schools: string[];
  tactics: string[];
  trance: TranceChoice;
  /** Insight Deadly from a partial or full trance; null for the default, worked out from the level. */
  tranceDeadly: number | null;
  /** A Legendary Green Steel effect, by its element ("Dust"), or null for none. */
  greenSteel: string | null;
  weaponExtras: string[];
}

export const ATTRIBUTES = ['Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma'];
export const SPELL_SCHOOLS = ['Evocation', 'Transmutation', 'Abjuration', 'Conjuration', 'Enchantment', 'Illusion', 'Necromancy'];
export const TACTICS = ['Stunning', 'Sundering', 'Vertigo'];

/** The Legendary Green Steel effects endgame builds usually pick from, by role. */
export function greenSteelChoices(role: BuildRole | null): string[] {
  return role === 'caster' ? ['Ash', 'Ooze', 'Vacuum'] : ['Dust', 'Ooze', 'Vacuum'];
}

export const greenSteelAffix = (element: string) => `Legendary ${element}`;

/** How many levels below the cap "endgame" starts. */
export const ENDGAME_LEVELS = 6;

export const TRANCE_LABEL = 'Trance';
/** What the Melee and Ranged packages have always assumed for a trance, when the level gives nothing better. */
const FALLBACK_TRANCE_DEADLY = 10;

export function emptyAnswers(): NewBuildAnswers {
  return {
    role: null,
    trapping: false,
    level: 'endgame',
    weaponTypes: null,
    offhandTypes: null,
    armorTypes: null,
    mainStat: null,
    otherStats: [],
    spellpowers: [],
    schools: [],
    tactics: [],
    trance: 'none',
    tranceDeadly: null,
    greenSteel: null,
    weaponExtras: []
  };
}

/**
 * Answers for a newly chosen role: what depends on the role starts over at
 * its defaults, and the rest (level, armor, trapping) stays.
 */
export function withRole(answers: NewBuildAnswers, role: BuildRole, healer = false): NewBuildAnswers {
  const martial = role !== 'caster';
  return {
    ...answers,
    role,
    weaponTypes: null,
    offhandTypes: null,
    mainStat: role === 'melee' ? 'Strength' : role === 'ranged' ? 'Dexterity' : healer ? 'Wisdom' : null,
    otherStats: answers.otherStats.filter(stat => stat !== answers.mainStat),
    spellpowers: role === 'caster' && healer ? ['Healing'] : [],
    schools: [],
    tactics: [],
    trance: martial ? 'partial' : 'none',
    greenSteel: null,
    weaponExtras: []
  };
}

export interface PlanContext {
  packages: ReadonlyMap<string, ReadonlyArray<string>>;
  spellpowerPackages: ReadonlyMap<string, ReadonlyArray<string>>;
  /** The highest item level in the data: the cap. */
  maxLevel: number;
  /** The best Competence Deadly an item gives at the build's levels, for the trance default. */
  bestCompetenceDeadly: number;
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
  hiddenTypes: Set<string>;
  /** Non-gear entries, all labelled TRANCE_LABEL. */
  externals: PlannedExternal[];
}

export function levelRangeOf(answers: NewBuildAnswers, maxLevel: number): [number, number] {
  if (answers.level === 'endgame') {
    return [Math.max(1, maxLevel - ENDGAME_LEVELS), maxLevel];
  }
  return answers.level;
}

/** A partial trance's Insight Deadly, unless the player gave one: half again the best Competence Deadly on gear. */
export function defaultTranceDeadly(bestCompetenceDeadly: number): number {
  return bestCompetenceDeadly > 0 ? Math.round(bestCompetenceDeadly * 1.5) : FALLBACK_TRANCE_DEADLY;
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
  add(answers.mainStat ? [answers.mainStat] : []);
  add(answers.otherStats);
  if (answers.greenSteel) {
    add([greenSteelAffix(answers.greenSteel)]);
  }
  if (role === 'melee' || role === 'ranged') {
    add(answers.weaponExtras);
  }

  return {
    tracked,
    levelRange: levelRangeOf(answers, context.maxLevel),
    hiddenTypes: hiddenTypesOf(answers),
    externals: tranceExternals(answers, context)
  };
}

function hiddenTypesOf(answers: NewBuildAnswers): Set<string> {
  const hidden = new Set<string>();
  const allowWeapons = answers.weaponTypes
    ?? (answers.role === 'melee' ? MELEE_WEAPON_TYPES : answers.role === 'ranged' ? RANGED_WEAPON_TYPES : null);
  const hideAllBut = (all: ReadonlyArray<string>, allowed: ReadonlyArray<string> | null) => {
    if (allowed) {
      all.filter(type => !allowed.includes(type)).forEach(type => hidden.add(type));
    }
  };
  // A caster's weapon is whatever carries their stats: no weapon filter for them.
  hideAllBut(ALL_WEAPON_TYPES, answers.role === 'caster' ? null : allowWeapons);
  hideAllBut(OFFHAND_TYPES, answers.offhandTypes);
  hideAllBut(ARMOR_TYPES, answers.armorTypes);
  return hidden;
}

function tranceExternals(answers: NewBuildAnswers, context: PlanContext): PlannedExternal[] {
  if (answers.role === 'caster' || answers.role === null || answers.trance === 'none') {
    return [];
  }
  const deadly = answers.tranceDeadly ?? defaultTranceDeadly(context.bestCompetenceDeadly);
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
