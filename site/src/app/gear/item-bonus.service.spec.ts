import { TestBed } from '@angular/core/testing';

import { Item } from './item';
import { ItemBonusService } from './item-bonus.service';

describe('ItemBonusService', () => {
  let service: ItemBonusService;
  const names = (slot: string, kind: 'mythic' | 'reaper' | 'curse') => service.getOptions(kind, slot).map(option => option.name);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ItemBonusService);
  });

  it('offers Mythic values by slot: +2/+4 on weapons and armor, +1/+3 on clothing and jewelry', () => {
    expect(names('Weapon', 'mythic')).toEqual(['Mythic +2 (Melee/Ranged/Spell Power)', 'Mythic +4 (Melee/Ranged/Spell Power)']);
    expect(names('Cloak', 'mythic')).toEqual(['Mythic +1 (PRR/MRR)', 'Mythic +3 (PRR/MRR)']);
  });

  it('offers both rings the ring bonuses', () => {
    expect(names('Ring1', 'reaper')).toEqual(names('Ring2', 'reaper'));
    expect(names('Ring1', 'reaper')).toContain('Reaper Ring Boost (+3% Spell Cost Reduction, +3 MRR)');
    expect(names('Ring1', 'mythic')).toEqual(['Mythic +1 (Melee/Ranged/Spell Power)', 'Mythic +3 (Melee/Ranged/Spell Power)']);
  });

  it('offers every curse on every slot but Quiver', () => {
    expect(names('Weapon', 'curse')).toContain('Curse of Major Strength');
    expect(names('Weapon', 'curse')).toEqual(names('Ring2', 'curse'));
    for (const kind of ['mythic', 'reaper', 'curse'] as const) {
      expect(names('Quiver', kind)).toEqual([]);
    }
  });

  it('keeps a curse the planner can\'t express, with no affixes', () => {
    expect(service.find('curse', 'Helm', 'Curse of the Unbreakable')?.affixes).toEqual([]);
  });

  it('finds an option by name only where the slot can carry it', () => {
    expect(service.find('reaper', 'Helm', 'Reaper Helmet Enchantment')?.affixes.map(affix => [affix.name, affix.type, affix.value]))
      .toEqual([['Well Rounded', 'Reaper', 2]]);
    expect(service.find('reaper', 'Boots', 'Reaper Helmet Enchantment')).toBeUndefined();
  });

  it('totals the best Mythic and Reaper option in each slot, counting both rings and no quiver', () => {
    const maxima = new Map(service.getMaxima(['Armor', 'Boots', 'Ring1', 'Ring2', 'Quiver'])
      .map(affix => [`${affix.name}/${affix.type}`, affix.value]));

    // Mythic: +4 armor and +3 boots; +3 on each ring.
    expect(maxima.get('Physical Sheltering/Mythic')).toBe(7);
    expect(maxima.get('Melee Power/Mythic')).toBe(6);
    // Reaper: +3 armor, +3 on each ring, and +5 boots from the boots enchantment - not that and the
    // boots' +3 PRR enchantment together, since an item carries one.
    expect(maxima.get('Physical Sheltering/Reaper')).toBe(14);
    // +10 from each ring's boost and +3 from the Power enchantment on armor and boots.
    expect(maxima.get('Universal Spell Power/Reaper')).toBe(26);
    expect([...maxima.keys()].some(key => key.endsWith('/Fortune'))).toBe(false);
  });

  it('hands out one shared option, as items carry it by reference', () => {
    expect(service.find('curse', 'Helm', 'Curse of Major Strength')).toBe(service.find('curse', 'Boots', 'Curse of Major Strength'));
  });
});

describe('Item bonuses', () => {
  const makeHelm = () => new Item({
    name: 'Test Helm', slot: 'Helm', type: 'Helm', ml: 1, url: '', quests: [], artifact: false,
    affixes: [{ name: 'Wisdom', type: 'Enhancement', value: 5 }],
  });

  beforeEach(() => TestBed.configureTestingModule({}));

  it('adds a carried bonus\'s affixes to the item\'s active affixes', () => {
    const helm = makeHelm();
    helm.bonuses.curse = TestBed.inject(ItemBonusService).find('curse', 'Helm', 'Curse of the Power of Mind');

    expect(helm.getActiveAffixes().map(affix => `${affix.name} ${affix.type} ${affix.value}`)).toEqual([
      'Wisdom Enhancement 5', 'Intelligence Fortune 1', 'Wisdom Fortune 1', 'Charisma Fortune 1',
    ]);
  });

  it('copies its bonuses with the item, without sharing the copy\'s choices', () => {
    const helm = makeHelm();
    const bonuses = TestBed.inject(ItemBonusService);
    helm.bonuses.mythic = bonuses.find('mythic', 'Helm', 'Mythic +3 (PRR/MRR)');

    const copy = new Item(helm);
    copy.bonuses.curse = bonuses.find('curse', 'Helm', 'Curse of Major Strength');

    expect(copy.bonuses.mythic?.name).toBe('Mythic +3 (PRR/MRR)');
    expect(helm.bonuses.curse).toBeUndefined();
  });

  it('carries none from game data', () => {
    expect(makeHelm().bonuses).toEqual({});
  });
});
