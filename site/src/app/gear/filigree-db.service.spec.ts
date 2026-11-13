import { TestBed } from '@angular/core/testing';

import { Affix } from '../affixes/affix';
import { FiligreeDbService } from './filigree-db.service';
import { FILIGREE_BONUS_TYPE, FILIGREE_SET_BONUS_TYPE } from './filigree';

/** Runs over the real data/filigree.json (test-setup.ts loads it), so values are the game's. */
describe('FiligreeDbService', () => {
  let db: FiligreeDbService;
  const noGroups = (affixes: Affix[]) => affixes;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    db = TestBed.inject(FiligreeDbService);
  });

  it('lists every filigree by name, sorted', () => {
    const names = db.getNames();
    expect(names.length).toBeGreaterThan(300);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(db.get('Celerity: Dexterity')?.sets).toEqual(['Celerity']);
    expect(db.get('No Such Filigree')).toBeUndefined();
    expect(db.getSets('No Such Filigree')).toEqual([]);
  });

  it('puts a raid filigree in both of its sets', () => {
    expect(db.getSets('Celerity/Vigilance: Wisdom')).toEqual(['Celerity', 'Vigilance']);
    expect(db.getFiligreesInSet('Celerity')).toContain('Celerity/Vigilance: Wisdom');
    expect(db.getFiligreesInSet('Vigilance')).toContain('Celerity/Vigilance: Wisdom');
    expect(db.getFiligreesInSet('Celerity')).toContain('Celerity: Dexterity');
  });

  it('gives a filigree its own bonuses, and the rare bonus only for a rare copy', () => {
    const describe = (affixes: Affix[]) => affixes.map(affix => `${affix.name} ${affix.type} ${affix.value}`);
    expect(describe(db.getAffixes({ name: 'Celerity/Vigilance: Wisdom', rare: false })))
      .toEqual(['Wisdom Filigree 2']);
    expect(describe(db.getAffixes({ name: 'Celerity/Vigilance: Wisdom', rare: true })))
      .toEqual(['Wisdom Filigree 2', 'Magical Sheltering Filigree 4']);
    expect(db.getAffixes({ name: 'No Such Filigree', rare: true })).toEqual([]);
  });

  it('marks set tiers eligible up to the pieces slotted, and sums the eligible ones', () => {
    const tiers = db.getSetTiers('Angelic Wings', 3);
    expect(tiers.map(tier => [tier.threshold, tier.eligible])).toEqual([[2, true], [3, true], [4, false], [5, false]]);
    expect(db.getSetBonus('Angelic Wings', 3).map(affix => affix.name)).toEqual(['Turn Undead Charge', 'Magical Sheltering']);
    expect(db.getSetBonus('Angelic Wings', 1)).toEqual([]);
    expect(db.getSetTiers('No Such Set', 5)).toEqual([]);
  });

  it('knows which sets are rare and where each generation drops', () => {
    expect(db.isRareSet('Coalesced Magic')).toBe(true);
    expect(db.isRareSet('Angelic Wings')).toBe(false);
    expect(db.getGeneration('Celerity: Dexterity')).toEqual({
      key: '1', generation: { packs: ['Mists of Ravenloft', 'Disciples of Rage', 'White Plume Mountain and Other Tales'] },
    });
    expect(db.getGeneration('Celerity/Vigilance: Wisdom')?.generation.source).toBe('Thread of Fate');
    expect(db.getGeneration('No Such Filigree')).toBeNull();
  });

  describe('findFiligreesWithAffixAndType', () => {
    it('lists the filigrees giving an affix, best rare copy first, with what a normal copy gives', () => {
      const matches = db.findFiligreesWithAffixAndType('Dexterity', FILIGREE_BONUS_TYPE, noGroups);
      expect(matches.slice(0, 2).map(match => [match.name, match.value, match.rareValue])).toEqual([
        ['Dance of the Wind/Next Fall: Dexterity', 2, 2],
        ['Shadowstrike/Bend Fate: Dexterity', 2, 2],
      ]);
      expect(matches.every(match => match.value === 1 || match.value === 2)).toBe(true);
    });

    it('includes a filigree that only gives the affix as its rare bonus, at 0 for a normal copy', () => {
      const match = db.findFiligreesWithAffixAndType('Magical Sheltering', FILIGREE_BONUS_TYPE, noGroups)
        .find(entry => entry.name === 'Celerity/Vigilance: Wisdom');
      expect(match).toEqual({ name: 'Celerity/Vigilance: Wisdom', sets: ['Celerity', 'Vigilance'], value: 0, rareValue: 4 });
    });

    it('matches only the bonus type asked for', () => {
      expect(db.findFiligreesWithAffixAndType('Speed', 'Enhancement', noGroups).map(match => [match.name, match.value]))
        .toEqual([["Snowpeak's Gifts: Movement Speed", 30]]);
      expect(db.findFiligreesWithAffixAndType('Speed', FILIGREE_BONUS_TYPE, noGroups)).toEqual([]);
    });

    it('counts an affix group toward its members through `flatten`', () => {
      const asGroup = (affixes: Affix[]) => affixes.flatMap(affix => affix.name === 'Wisdom'
        ? [affix, new Affix({ name: 'Wisdom Member', type: affix.type, value: affix.value })]
        : [affix]);
      const matches = db.findFiligreesWithAffixAndType('Wisdom Member', FILIGREE_BONUS_TYPE, asGroup);
      expect(matches.map(match => match.name)).toContain('Celerity/Vigilance: Wisdom');
    });
  });

  describe('findSetsWithAffixAndType', () => {
    it('gives each set the pieces its first such tier needs and the whole set\'s total', () => {
      const matches = db.findSetsWithAffixAndType('Wizardry', FILIGREE_SET_BONUS_TYPE, noGroups);
      expect(matches).toContainEqual({ set: 'Angelic Wings', threshold: 4, value: 200 });
      expect(matches.map(match => match.value)).toEqual([...matches.map(match => match.value)].sort((a, b) => b - a));
    });

    it('matches only the bonus type asked for', () => {
      expect(db.findSetsWithAffixAndType('Wizardry', FILIGREE_BONUS_TYPE, noGroups)
        .some(match => match.set === 'Angelic Wings')).toBe(false);
    });
  });

  describe('getMaxima', () => {
    const maximum = (artifactSlots: number, affix: string, type: string) =>
      db.getMaxima(artifactSlots, noGroups).byAffix.get(affix)?.get(type);

    it('sums the best distinct filigrees over a full weapon and the artifact', () => {
      // Counted at each filigree's rare copy: three +2s and seven +1s fill the weapon (13), and the
      // artifact's three take the +2s again (6), as a filigree can be in both.
      expect(maximum(3, 'Dexterity', FILIGREE_BONUS_TYPE)).toBe(19);
      expect(maximum(0, 'Dexterity', FILIGREE_BONUS_TYPE)).toBe(13);
    });

    it('keeps the best single value of an ordinary bonus type, and 1 for an on/off effect', () => {
      expect(maximum(3, 'Speed', 'Enhancement')).toBe(30);
      expect(maximum(3, 'Deathblock', 'Bool')).toBe(1);
    });

    it('spreads set pieces over every slot for the most a set bonus can give', () => {
      const withArtifact = maximum(10, 'Wizardry', FILIGREE_SET_BONUS_TYPE)!;
      const weaponOnly = maximum(0, 'Wizardry', FILIGREE_SET_BONUS_TYPE)!;
      expect(weaponOnly).toBeGreaterThanOrEqual(200);
      expect(withArtifact).toBeGreaterThanOrEqual(weaponOnly);
    });

    it('counts an affix group toward its members through `flatten`', () => {
      const asGroup = (affixes: Affix[]) => affixes.flatMap(affix => affix.name === 'Dexterity'
        ? [affix, new Affix({ name: 'Dexterity Member', type: affix.type, value: affix.value })]
        : [affix]);
      const maxima = db.getMaxima(3, asGroup).byAffix;
      expect(maxima.get('Dexterity Member')?.get(FILIGREE_BONUS_TYPE)).toBe(19);
      expect(maxima.get('Dexterity')?.get(FILIGREE_BONUS_TYPE)).toBe(19);
    });
  });
});
