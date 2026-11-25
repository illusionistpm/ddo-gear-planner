import { TestBed } from '@angular/core/testing';

import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { EquippedService } from './equipped.service';

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

  it('scores nothing when no affix is tracked', () => {
    equipped.setImportantAffixes([]);
    expect(equipped.getSuggestionScorer('Boots')(fastBoots())).toBe(0);
  });
});
