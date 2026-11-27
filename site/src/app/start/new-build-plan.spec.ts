import { DOCENT_TYPE, MELEE_WEAPON_TYPES, OFFHAND_TYPES, RANGED_WEAPON_TYPES } from '../gear/item-type-groups';
import {
  ATTRIBUTES, LEVELLING_RANGE, NewBuildAnswers, PlanContext, emptyAnswers, greenSteelChoices, planFromAnswers, tranceDeadlyFor,
  withRole
} from './new-build-plan';

const context: PlanContext = {
  packages: new Map([
    ['Basic', ['Constitution', 'Dodge']],
    ['Melee', ['Melee Power', 'Deadly']],
    ['Ranged', ['Ranged Power', 'Deadly']],
    ['Caster', ['Spellcraft']],
    ['Trapping', ['Disable Device']]
  ]),
  spellpowerPackages: new Map([['Healing', ['Devotion']], ['Fire', ['Combustion']]]),
  maxLevel: 36,
  bestCompetenceDeadly: 12
};

const answers = (overrides: Partial<NewBuildAnswers> = {}): NewBuildAnswers => ({ ...emptyAnswers(), ...overrides });

describe('planFromAnswers', () => {
  it('always tracks Basic, even with no role chosen, and filters nothing', () => {
    const plan = planFromAnswers(answers(), context);

    expect(plan.tracked).toEqual(['Constitution', 'Dodge']);
    expect(plan.hiddenTypes.size).toBe(0);
    expect(plan.externals).toEqual([]);
  });

  it('carries the gear sources: raid and rare items, and the packs hidden', () => {
    const plan = planFromAnswers(answers({ showRaid: false, showRare: false, hiddenPacks: ['Tomb of Annihilation'] }), context);

    expect(plan.showRaid).toBe(false);
    expect(plan.showRare).toBe(false);
    expect(Array.from(plan.hiddenPacks)).toEqual(['Tomb of Annihilation']);
    expect(planFromAnswers(answers(), context).showRaid).toBe(true);
    expect(planFromAnswers(answers(), context).hiddenPacks.size).toBe(0);
  });

  it('runs endgame from 30 to the cap', () => {
    expect(planFromAnswers(answers(), context).levelRange).toEqual([30, 36]);
    // New gear raises the cap; endgame still starts at 30.
    expect(planFromAnswers(answers(), { ...context, maxLevel: 37 }).levelRange).toEqual([30, 37]);
    expect(LEVELLING_RANGE).toEqual([1, 20]);
    expect(planFromAnswers(answers({ level: [12, 20] }), context).levelRange).toEqual([12, 20]);
  });

  it('gives a melee build its package, Strength, Dust and a universal trance, and hides ranged weapons', () => {
    const plan = planFromAnswers(withRole(answers(), 'melee'), context);

    expect(plan.tracked).toEqual(['Constitution', 'Dodge', 'Melee Power', 'Deadly', 'Strength', 'Legendary Dust']);
    expect(plan.externals).toEqual([{ affixName: 'Deadly', bonusType: 'Insight', value: 18 }]);
    for (const type of RANGED_WEAPON_TYPES) {
      expect(plan.hiddenTypes.has(type)).toBe(true);
    }
    for (const type of MELEE_WEAPON_TYPES) {
      expect(plan.hiddenTypes.has(type)).toBe(false);
    }
  });

  it('narrows a ranged build to the weapon types picked', () => {
    const plan = planFromAnswers({ ...withRole(answers(), 'ranged'), weaponTypes: ['Long Bows'] }, context);

    expect(plan.tracked).toContain('Dexterity');
    expect(plan.hiddenTypes.has('Long Bows')).toBe(false);
    expect(plan.hiddenTypes.has('Short Bows')).toBe(true);
    expect(plan.hiddenTypes.has('Long Swords')).toBe(true);
  });

  it('never filters a caster\'s weapons, only the offhand picked', () => {
    const plan = planFromAnswers({ ...withRole(answers(), 'caster'), offhandTypes: ['Orbs'], weaponTypes: ['Long Bows'] }, context);

    expect(plan.hiddenTypes.has('Long Swords')).toBe(false);
    expect(plan.hiddenTypes.has('Orbs')).toBe(false);
    expect(Array.from(plan.hiddenTypes).sort()).toEqual(OFFHAND_TYPES.filter(type => type !== 'Orbs').sort());
    expect(plan.externals).toEqual([]);
  });

  it('leaves the offhand alone for a build of two-handers only, whose off hand is empty anyway', () => {
    const plan = planFromAnswers({ ...withRole(answers(), 'melee'), weaponTypes: ['Great Swords'], offhandTypes: ['Orbs'] }, context);

    for (const type of OFFHAND_TYPES) {
      expect(plan.hiddenTypes.has(type)).toBe(false);
    }
  });

  it('hides every shield, orb and rune arm for a second weapon', () => {
    const plan = planFromAnswers({ ...withRole(answers(), 'melee'), offhandTypes: [] }, context);

    for (const type of OFFHAND_TYPES) {
      expect(plan.hiddenTypes.has(type)).toBe(true);
    }
  });

  it('hides all armor but Docents for a Warforged, and Docents for anyone else', () => {
    const docent = planFromAnswers(answers({ armorTypes: [DOCENT_TYPE] }), context);
    expect(docent.hiddenTypes.has(DOCENT_TYPE)).toBe(false);
    expect(docent.hiddenTypes.has('Heavy armor')).toBe(true);

    const heavy = planFromAnswers(answers({ armorTypes: ['Heavy armor'] }), context);
    expect(heavy.hiddenTypes.has(DOCENT_TYPE)).toBe(true);
    expect(heavy.hiddenTypes.has('Heavy armor')).toBe(false);
  });

  it('tracks a caster\'s spell powers and schools, and a healer starts on Healing and Wisdom', () => {
    const healer = withRole(answers(), 'caster', true);
    const plan = planFromAnswers({ ...healer, schools: ['Necromancy'] }, context);

    expect(plan.tracked).toEqual(['Constitution', 'Dodge', 'Spellcraft', 'Devotion', 'Necromancy Focus', 'Wisdom', 'Legendary Ash']);
  });

  it('tracks the Green Steel effect, damage boosts and tactics picked', () => {
    const plan = planFromAnswers({
      ...withRole(answers(), 'melee'),
      greenSteel: 'Dust',
      damageBoosts: ['Dripping with Magma'],
      tactics: ['Stunning']
    }, context);

    expect(plan.tracked).toEqual(expect.arrayContaining(['Legendary Dust', 'Dripping with Magma', 'Stunning']));
  });

  it('drops what belongs to another role', () => {
    const wasMelee = { ...withRole(answers(), 'melee'), tactics: ['Stunning'], damageBoosts: ['Relentless Fury'] };
    const plan = planFromAnswers({ ...wasMelee, role: 'caster' }, context);

    expect(plan.tracked).not.toContain('Stunning');
    expect(plan.tracked).not.toContain('Relentless Fury');
    expect(plan.externals).toEqual([]);
  });

  it('marks the tactics as covered for any trance, and Insight Accuracy too for a class trance', () => {
    const universal = planFromAnswers({ ...withRole(answers(), 'melee'), tactics: ['Stunning'] }, context);
    expect(universal.externals).toEqual([
      { affixName: 'Deadly', bonusType: 'Insight', value: 18 },
      { affixName: 'Stunning', bonusType: 'Insight', value: null }
    ]);

    const plan = planFromAnswers({
      ...withRole(answers(), 'melee'), trance: 'class', tactics: ['Stunning', 'Vertigo']
    }, context);

    expect(plan.externals).toEqual([
      { affixName: 'Deadly', bonusType: 'Insight', value: 18 },
      { affixName: 'Accuracy', bonusType: 'Insight', value: null },
      { affixName: 'Stunning', bonusType: 'Insight', value: null },
      { affixName: 'Vertigo', bonusType: 'Insight', value: null }
    ]);
  });

  it('adds no trance entry for "none"', () => {
    expect(planFromAnswers({ ...withRole(answers(), 'ranged'), trance: 'none' }, context).externals).toEqual([]);
  });
});

describe('new build choices', () => {
  it('never offers Constitution, which Basic tracks for everyone', () => {
    expect(ATTRIBUTES).not.toContain('Constitution');
  });

  it('offers Ash instead of Dust to casters', () => {
    expect(greenSteelChoices('melee')).toEqual(['Dust', 'Ooze', 'Vacuum']);
    expect(greenSteelChoices('caster')).toEqual(['Ash', 'Ooze', 'Vacuum']);
  });

  it('estimates a trance\'s Insight Deadly as half again the best Competence Deadly, or 10 with none', () => {
    expect(tranceDeadlyFor(12)).toBe(18);
    expect(tranceDeadlyFor(0)).toBe(10);
  });

  it('starts melee and ranged on Dust, casters on Ash', () => {
    expect(withRole(answers(), 'melee').greenSteel).toBe('Dust');
    expect(withRole(answers(), 'ranged').greenSteel).toBe('Dust');
    expect(withRole(answers(), 'caster').greenSteel).toBe('Ash');
    expect(withRole(answers(), 'caster', true).greenSteel).toBe('Ash');
  });

  it('keeps the level, armor and trapping on a change of role, and resets the rest', () => {
    const before = {
      ...withRole(answers({ trapping: true, armorTypes: ['Light armor'], level: [10, 20], showRaid: false, hiddenPacks: ['Tomb of Annihilation'] }), 'melee'),
      greenSteel: 'Ooze'
    };
    const after = withRole(before, 'ranged');

    expect(after.trapping).toBe(true);
    expect(after.armorTypes).toEqual(['Light armor']);
    expect(after.level).toEqual([10, 20]);
    expect(after.showRaid).toBe(false);
    expect(after.hiddenPacks).toEqual(['Tomb of Annihilation']);
    expect(after.greenSteel).toBe('Dust');
    expect(after.abilities).toEqual(['Dexterity']);
  });
});
