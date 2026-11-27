import { TestBed } from '@angular/core/testing';

import { GearDbService } from '../gear/gear-db.service';
import { CraftableInit } from '../gear/game-data-types';
import { Item } from '../gear/item';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { EquippedService } from './equipped.service';
import { withSuggestedCrafting } from './suggestion-scorer';

function makeItem(name: string, slot: string, affixes: Array<{ name: string; type: string; value: number }>,
                  options: { sets?: string[]; artifact?: boolean } = {}) {
  return new Item({
    name, slot, type: 'Trinket items', ml: 30, affixes, sets: options.sets ?? [], url: '/page/' + name,
    crafting: [], quests: [], artifact: options.artifact ?? false,
  });
}

describe('EquippedService.getSuggestionScorer', () => {
  let equipped: EquippedService;
  let gearDB: GearDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    gearDB = TestBed.inject(GearDbService);
    equipped = TestBed.inject(EquippedService);
  });

  /** A real item in `slot` whose only augment slot is a Yellow one, carrying no Speed of its own. */
  function itemWithOnlyYellowSlot(slot: string): Item {
    const item = (gearDB.getFilteredGearBySlot(slot) ?? []).find(candidate =>
      (candidate.crafting ?? []).map(c => c.name).join('|') === 'Yellow Augment Slot'
      && !candidate.affixes.some(affix => affix.name === 'Speed'));
    expect(item).toBeTruthy();
    return new Item(item!);
  }

  const fastBoots = () => makeItem('Fast Boots', 'Boots', [{ name: 'Speed', type: 'Enhancement', value: 30 }]);
  const plainArtifact = () => makeItem('Plain Artifact', 'Trinket', [], { artifact: true });

  it('scores what a candidate adds to tracked affixes, and nothing for untracked ones', () => {
    equipped.setImportantAffixes(['Doublestrike']);
    // Equipped, so the assumed artifact's Yellow slot (a Doublestrike Topaz) doesn't cover it already.
    equipped.set(plainArtifact());
    const score = equipped.getSuggestionScorer('Boots');

    expect(score(makeItem('Striking Boots', 'Boots', [{ name: 'Doublestrike', type: 'Enhancement', value: 15 }]))).toBeGreaterThan(0);
    expect(score(makeItem('Seeking Boots', 'Boots', [{ name: 'Seeker', type: 'Enhancement', value: 15 }]))).toBe(0);
  });

  it('gives nothing for a bonus type the player ignores', () => {
    equipped.setImportantAffixes(['Doublestrike']);
    equipped.set(plainArtifact());
    equipped.addExternalAffixIgnored('Doublestrike', 'Enhancement', 'Not worth chasing');

    expect(equipped.getSuggestionScorer('Boots')(
      makeItem('Striking Boots', 'Boots', [{ name: 'Doublestrike', type: 'Enhancement', value: 15 }]))).toBe(0);
  });

  it('assumes a minor artifact, with its Yellow slot, until one is equipped', () => {
    equipped.setImportantAffixes(['Speed']);
    // An artifact's Yellow slot could hold a Topaz of Striding, so Speed on an item adds nothing.
    expect(equipped.getSuggestionScorer('Boots')(fastBoots())).toBe(0);

    equipped.set(plainArtifact());
    expect(equipped.getSuggestionScorer('Boots')(fastBoots())).toBeGreaterThan(0);
  });

  it('does not credit a candidate for what an equipped item\'s open augment slot can carry', () => {
    equipped.setImportantAffixes(['Speed']);
    equipped.set(plainArtifact());
    equipped.set(itemWithOnlyYellowSlot('Belt'));

    expect(equipped.getSuggestionScorer('Boots')(fastBoots())).toBe(0);
  });

  it('credits a candidate\'s own empty augment slots with what they could carry', () => {
    equipped.setImportantAffixes(['Speed']);
    equipped.set(plainArtifact());

    expect(equipped.getSuggestionScorer('Belt')(itemWithOnlyYellowSlot('Belt'))).toBeGreaterThan(0);
  });

  it('credits a set-granting crafting slot with the set bonus its piece would unlock', () => {
    const lostPurposeHelm = (gearDB.getFilteredGearBySlot('Helm') ?? [])
      .find(item => (item.crafting ?? []).some(c => c.name === 'Legendary Lost Purpose'));
    expect(lostPurposeHelm).toBeTruthy();
    const set = 'Legendary Forbidden Knowledge';
    const bonus = gearDB.getSetBonus(set, 3).find(affix => affix.type === 'Profane');
    expect(bonus).toBeTruthy();
    equipped.setImportantAffixes([bonus!.name]);
    equipped.set(plainArtifact());
    const without = equipped.getSuggestionScorer('Helm')(lostPurposeHelm!);

    equipped.set(makeItem('Piece One', 'Bracers', [], { sets: [set] }));
    equipped.set(makeItem('Piece Two', 'Belt', [], { sets: [set] }));
    const withTwoPieces = equipped.getSuggestionScorer('Helm')(lostPurposeHelm!);

    expect(withTwoPieces).toBeGreaterThan(without);
  });

  it('says what it would put in a candidate\'s empty crafting slots, and shows it on a copy', () => {
    equipped.setImportantAffixes(['Speed']);
    equipped.set(plainArtifact());
    const belt = itemWithOnlyYellowSlot('Belt');
    const crafts = equipped.getSuggestionScorer('Belt').suggestedCrafting(belt);

    expect(crafts.length).toBe(1);
    expect(crafts[0].option.affixes.some(affix => affix.name === 'Speed' && affix.value === 30)).toBe(true);
    const preview = withSuggestedCrafting(belt, crafts);
    expect(preview.crafting![0].selected).toBe(crafts[0].option);
    expect(belt.crafting![0].selected?.affixes.length ?? 0).toBe(0);
  });

  it('ranks a five-filigree-slot artifact above a one-slot one once Max Filigree Slots is tracked', () => {
    equipped.setImportantAffixes(['Speed', 'Heroic Inspiration']);
    const trinkets = gearDB.getFilteredGearBySlot('Trinket') ?? [];
    const voice = trinkets.find(item => item.name === 'Epic Voice of the Master');
    const hydra = trinkets.find(item => item.name === "The Hydra's Heart");
    expect(voice && hydra).toBeTruthy();
    const score = equipped.getSuggestionScorer('Trinket');

    expect(score(hydra!)).toBeGreaterThan(score(voice!));
  });

  /** Whether the crafting `crafts` put on `item` is crafting the planner itself allows. */
  function expectLegalCrafting(item: Item, crafts: ReturnType<ReturnType<EquippedService['getSuggestionScorer']>['suggestedCrafting']>) {
    const crafted = withSuggestedCrafting(item, crafts);
    for (const { index } of crafts) {
      const craftable = crafted.crafting![index];
      expect(crafted.isCraftingSlotOpen(craftable), `${item.name}: ${craftable.name} is open`).toBe(true);
      expect(crafted.isOptionAllowed(craftable.selected), `${item.name}: ${craftable.selected.name} is allowed`).toBe(true);
    }
  }

  it('fills only the augment slot a Legendary Alchemical Tier 3 opens, of Tier 1\'s or Tier 2\'s element', () => {
    const packages = TestBed.inject(AffixPackagesService);
    const alchemical = (gearDB.getFilteredGearBySlot('Weapon') ?? []).filter(item => item.name.startsWith('Legendary Alchemical'));
    expect(alchemical.length).toBeGreaterThan(0);
    for (const profile of [['Basic', 'Melee'], ['Basic', 'Caster']]) {
      const tracked = new Set<string>(['Strength', 'Intelligence']);
      profile.forEach(name => packages.packages.get(name)?.forEach(affix => tracked.add(affix)));
      packages.spellpowerPackages.get('Fire')?.forEach(affix => tracked.add(affix));
      equipped.setImportantAffixes([...tracked]);
      const scorer = equipped.getSuggestionScorer('Weapon');
      for (const item of alchemical) {
        const crafts = scorer.suggestedCrafting(item);
        expectLegalCrafting(item, crafts);
        const slotsFilled = crafts.filter(craft => /^(Green|Orange|Purple) Augment Slot$/.test(item.crafting![craft.index].name));
        expect(slotsFilled.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps Tier 1 or Tier 2 free for the element of a Tier 3 it chose first', () => {
    const TIERS = ['Legendary Alchemical Tier 1', 'Legendary Alchemical Tier 2'];
    const option = (element: string, affix: string, value: number, extra: object = {}) => ({
      name: `${element}: ${affix}`, element, affixes: [{ name: affix, type: 'Alchemical', value }], ...extra,
    });
    // Tier 3's Air option, with the Orange slot it opens, is the prize; Tiers 1 and 2 have no Air.
    const item = new Item({
      name: 'Test Alchemical Sword', slot: 'Weapon', type: 'Long Swords', ml: 29, url: '/page/Test',
      crafting: [
        { name: TIERS[0], options: [option('Fire', 'Strength', 3), option('Earth', 'Strength', 2)] },
        { name: TIERS[1], options: [option('Fire', 'Constitution', 3), option('Earth', 'Constitution', 2)] },
        { name: 'Legendary Alchemical Tier 3', options: [
          option('Air', 'Dexterity', 3, { elementFrom: TIERS, addsCrafting: ['Orange Augment Slot'] }),
          option('Fire', 'Wisdom', 1, { elementFrom: TIERS }),
        ] },
        { name: 'Orange Augment Slot', options: [{ name: 'Orange Gem', affixes: [{ name: 'Charisma', type: 'Insight', value: 10 }] }] },
      ],
    });
    equipped.setImportantAffixes(['Strength', 'Constitution', 'Dexterity', 'Wisdom', 'Charisma']);
    equipped.set(plainArtifact());
    const crafts = equipped.getSuggestionScorer('Weapon').suggestedCrafting(item);

    expectLegalCrafting(item, crafts);
    const chosen = crafts.map(craft => craft.option.name);
    expect(chosen).toContain('Air: Dexterity');
    expect(chosen).toContain('Orange Gem');
    // One tier stays empty, to be crafted Air.
    expect(chosen.filter(name => name.includes('Strength') || name.includes('Constitution')).length).toBe(1);
  });

  it('credits a weapon\'s [W] for a build that fights with weapons, and only for one', () => {
    const sword = (w: number) => new Item({
      name: `Sword ${w}`, slot: 'Weapon', type: 'Long Swords', ml: 34, url: '/page/Sword',
      affixes: [{ name: 'Doublestrike', type: 'Enhancement', value: 10 }], damage: { w, dice: '1d8+2' },
    });

    equipped.setImportantAffixes(['Doublestrike']);
    let score = equipped.getSuggestionScorer('Weapon');
    // One [W] is worth about as much as a full affix (Doublestrike 10 of ~46 is about 0.2).
    expect(score(sword(6.3)) - score(sword(4.8))).toBeGreaterThan(1);

    equipped.setImportantAffixes(['Combustion', 'Fire Lore']);
    score = equipped.getSuggestionScorer('Weapon');
    expect(score(sword(6.3))).toBe(score(sword(4.8)));
  });

  it('never lifts a weapon over a shield in the Offhand for its [W]', () => {
    const doublestrike = [{ name: 'Doublestrike', type: 'Enhancement', value: 10 }];
    const shield = new Item({ name: 'Shield', slot: 'Offhand', type: 'Large shields', ml: 34, url: '/page/Shield', affixes: doublestrike });
    const weapon = new Item({
      name: 'Sword', slot: 'Weapon', type: 'Long Swords', ml: 34, url: '/page/Sword', affixes: doublestrike, damage: { w: 6.3, dice: '1d8+2' },
    });
    equipped.setImportantAffixes(['Doublestrike']);
    const score = equipped.getSuggestionScorer('Offhand');

    expect(score(weapon)).toBeLessThanOrEqual(score(shield));
  });

  describe('weapon effects', () => {
    const weapon = (name: string, effects: string[], crafting: CraftableInit[] = []) => new Item({
      name, slot: 'Weapon', type: 'Long Swords', ml: 34, url: '/page/' + name, damage: { w: 6, dice: '1d8+2' },
      affixes: effects.map(effect => ({ name: effect, type: 'Bool', value: 1 })), crafting,
    });
    const plain = () => weapon('Plain', []);

    it('counts crowd control and Legendary Green Steel effects for a build that fights with weapons', () => {
      equipped.setImportantAffixes(['Melee Power']);
      const score = equipped.getSuggestionScorer('Weapon');

      expect(score(weapon('Paralyzing', ['Legendary Paralysis']))).toBeGreaterThan(score(plain()));
      // Legendary Dust (35%) is worth more than a DC 100 crowd control effect (8%).
      expect(score(weapon('Dusty', ['Legendary Dust']))).toBeGreaterThan(score(weapon('Paralyzing', ['Legendary Paralysis'])));
      // Fixed damage isn't listed, so it's worth nothing.
      expect(score(weapon('Flaming', ['Flaming']))).toBe(score(plain()));
    });

    it('counts magical effects for a caster, and physical ones only for a build that fights with weapons', () => {
      equipped.setImportantAffixes(['Fire Spell Power']);
      const score = equipped.getSuggestionScorer('Weapon');

      expect(score(weapon('Ashen', ['Legendary Ash']))).toBeGreaterThan(score(plain()));
      expect(score(weapon('Dusty', ['Legendary Dust']))).toBe(score(plain()));
      // Vulnerable from weapon hits or vorpals needs a build that lands them; Vacuum's comes from spells too.
      expect(score(weapon('Burning', ['3rd Degree Burns']))).toBe(score(plain()));
      expect(score(weapon('Vacuum', ['Legendary Vacuum']))).toBeGreaterThan(score(plain()));
    });

    it('values Armor Destruction as the Armor-Piercing and Accuracy it comes to, for builds tracking them', () => {
      equipped.setImportantAffixes(['Melee Power', 'Armor-Piercing', 'Accuracy']);
      let score = equipped.getSuggestionScorer('Weapon');
      const improved = score(weapon('Improved', ['Improved Destruction']));
      expect(improved).toBeGreaterThan(score(weapon('Destruction', ['Destruction'])));
      expect(score(weapon('Destruction', ['Destruction']))).toBeGreaterThan(score(plain()));
      // The same debuff: the better one counts, once.
      expect(score(weapon('Both', ['Improved Destruction', 'Destruction']))).toBe(improved);

      equipped.setImportantAffixes(['Melee Power']);
      score = equipped.getSuggestionScorer('Weapon');
      expect(score(weapon('Improved', ['Improved Destruction']))).toBe(score(plain()));
    });

    it('counts effects that don\'t stack once', () => {
      equipped.setImportantAffixes(['Melee Power']);
      const score = equipped.getSuggestionScorer('Weapon');

      expect(score(weapon('Twice Vulnerable', ['Legendary Vacuum', 'Frostbite']))).toBe(score(weapon('Vulnerable', ['Legendary Vacuum'])));
    });

    it('counts them only in the Weapon slot, so an Offhand weapon doesn\'t outrank a shield for them', () => {
      equipped.setImportantAffixes(['Melee Power']);
      const shield = new Item({ name: 'Shield', slot: 'Offhand', type: 'Large shields', ml: 34, url: '/page/Shield' });

      expect(equipped.getSuggestionScorer('Offhand')(weapon('Dusty', ['Legendary Dust']))).toBeLessThanOrEqual(
        equipped.getSuggestionScorer('Offhand')(shield));
    });

    it('fills a crafting slot with the option that grants an effect', () => {
      equipped.setImportantAffixes(['Melee Power']);
      const item = weapon('Craftable', [], [{ name: 'Test Slot', options: [
        { name: 'Paralysis', affixes: [{ name: 'Legendary Paralysis', type: 'Bool', value: 1 }] },
        { name: 'Flames', affixes: [{ name: 'Flaming', type: 'Bool', value: 1 }] },
      ] }]);

      expect(equipped.getSuggestionScorer('Weapon').suggestedCrafting(item).map(craft => craft.option.name)).toEqual(['Paralysis']);
    });
  });

  it('scores nothing when no affix is tracked', () => {
    equipped.setImportantAffixes([]);
    expect(equipped.getSuggestionScorer('Boots')(fastBoots())).toBe(0);
  });
});
