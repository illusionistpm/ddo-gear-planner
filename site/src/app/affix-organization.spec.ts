import { AffixService } from './affix.service';
import { getAffixCategory, groupAffixNames, matchesAffixSearch, UTILITY_CHECKLIST_CATEGORY } from './affix-organization';

describe('affix organization', () => {
  let affixSvc: AffixService;

  beforeEach(() => {
    affixSvc = new AffixService();
  });

  it('categorizes high-confidence affix families', () => {
    expect(getAffixCategory('Strength')).toBe('Attributes');
    expect(getAffixCategory('Search')).toBe('Skills');
    expect(getAffixCategory('Fortitude Save')).toBe('Saves');
    expect(getAffixCategory('Fire Spell Power')).toBe('Casting');
    expect(getAffixCategory('Deadly')).toBe('Offense');
    expect(getAffixCategory('Physical Sheltering')).toBe('Defense');
    expect(getAffixCategory('Freedom of Movement')).toBe(UTILITY_CHECKLIST_CATEGORY);
    expect(getAffixCategory('Deathblock')).toBe('Immunities');
    expect(getAffixCategory('Mysterious Future Affix')).toBe('Other');
  });

  it('categorizes common weapon, armor, utility, and damage affixes', () => {
    expect(getAffixCategory('Enhancement Bonus (Weapon)')).toBe('Offense');
    expect(getAffixCategory('Enhancement Bonus (Armor)')).toBe('Defense');
    expect(getAffixCategory('Destruction')).toBe('Offense');
    expect(getAffixCategory('Improved Destruction')).toBe('Offense');
    expect(getAffixCategory('Maiming')).toBe('Offense');
    expect(getAffixCategory('Healing Amplification')).toBe('Defense');
    expect(getAffixCategory('Negative Amplification')).toBe('Defense');
    expect(getAffixCategory('Repair Amplification')).toBe('Defense');
    expect(getAffixCategory('Distant Diversion')).toBe('Defense');
    expect(getAffixCategory('Mystic Diversion')).toBe('Defense');
    expect(getAffixCategory('Magical Efficiency')).toBe(UTILITY_CHECKLIST_CATEGORY);
    expect(getAffixCategory('Returning')).toBe(UTILITY_CHECKLIST_CATEGORY);
    expect(getAffixCategory('Shield Bashing')).toBe('Offense');
    expect(getAffixCategory('Holy')).toBe('Offense');
    expect(getAffixCategory('Adamantine')).toBe('Offense');
    expect(getAffixCategory('Silver')).toBe('Offense');
    expect(getAffixCategory('Keen')).toBe('Offense');
    expect(getAffixCategory('Chilling')).toBe('Offense');
  });

  it('uses a shared child category for affix group parents without direct classification', () => {
    expect(getAffixCategory('Spell Focus Mastery', affixSvc)).toBe('Casting');
    expect(getAffixCategory('Alluring Skills Bonus', affixSvc)).toBe('Skills');
  });

  it('leaves affix group parents in Other when children cross categories', () => {
    affixSvc.affixGroups.set('Mixed Test Parent', ['Strength', 'Deadly']);

    expect(getAffixCategory('Mixed Test Parent', affixSvc)).toBe('Other');
    expect(getAffixCategory('Well Rounded', affixSvc)).toBe('Attributes');
  });

  it('matches canonical names generously', () => {
    expect(matchesAffixSearch('Armor-Piercing', 'armor piercing', affixSvc)).toBeTrue();
    expect(matchesAffixSearch('Armor-Piercing', 'arm pier', affixSvc)).toBeTrue();
    expect(matchesAffixSearch('Armor-Piercing', 'pier arm', affixSvc)).toBeTrue();
  });

  it('matches synonyms generously', () => {
    expect(matchesAffixSearch('Armor-Piercing', 'fort bypass', affixSvc)).toBeTrue();
    expect(matchesAffixSearch('Spell Focus Mastery', 'all dc', affixSvc)).toBeTrue();
  });

  it('matches containing affix groups and sibling group components', () => {
    expect(matchesAffixSearch('Cold Lore', 'spell lore', affixSvc)).toBeTrue();
    expect(matchesAffixSearch('Negative Energy Absorption', 'lifesealed death', affixSvc)).toBeTrue();
  });

  it('groups only matching affixes', () => {
    const groups = groupAffixNames(['Strength', 'Deadly', 'Cold Lore'], 'spell lore', affixSvc);

    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe('Casting');
    expect(groups[0].affixes).toEqual(['Cold Lore']);
  });

  it('sorts utility and checklist before other groups', () => {
    const groups = groupAffixNames(['Strength', 'Speed'], '', affixSvc);

    expect(groups.map(group => group.name)).toEqual([UTILITY_CHECKLIST_CATEGORY, 'Attributes']);
  });

  it('renders saves before skills when both are present', () => {
    const groups = groupAffixNames(['Search', 'Fortitude Save'], '', affixSvc);

    expect(groups.map(group => group.name)).toEqual(['Saves', 'Skills']);
  });

  it('groups parent affixes by unanimous child classification', () => {
    affixSvc.affixGroups.set('Mixed Test Parent', ['Strength', 'Deadly']);
    const groups = groupAffixNames(['Spell Focus Mastery', 'Mixed Test Parent'], '', affixSvc);

    expect(groups).toContain({ name: 'Casting', affixes: ['Spell Focus Mastery'] });
    expect(groups).toContain({ name: 'Other', affixes: ['Mixed Test Parent'] });
  });
});
