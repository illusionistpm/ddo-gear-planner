import { TestBed } from '@angular/core/testing';

import { EssenceCraftingService } from './essence-crafting.service';
import { Item } from './item';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

describe('EssenceCraftingService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service).toBeTruthy();
  });

  it('offers the Underwater Action option as the Water Breathing items carry, still matching old links', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const options = service.getValuesForML('Ring', 20).flatMap(craftable => craftable.options);
    const option = options.find(candidate => candidate.affixes.some(affix => affix.name === 'Water Breathing'));

    expect(option?.affixes.map(affix => [affix.name, affix.type])).toEqual([['Water Breathing', 'Bool']]);
    expect(option?.matchesParamDescription('Underwater Action1')).toBe(true);
    expect(options.some(candidate => candidate.affixes.some(affix => affix.name === 'Underwater Action'))).toBe(false);
  });

  it('offers Blindness Immunity as Immunity to Blindness, still matching old links', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const options = service.getValuesForML('Goggles', 20).flatMap(craftable => craftable.options);
    const option = options.find(candidate => candidate.affixes.some(affix => affix.name === 'Immunity to Blindness'));

    expect(option?.affixes.map(affix => [affix.name, affix.type])).toEqual([['Immunity to Blindness', 'Bool']]);
    expect(option?.matchesParamDescription('Blindness Immunity1')).toBe(true);
    expect(options.some(candidate => candidate.affixes.some(affix => affix.name === 'Blindness Immunity'))).toBe(false);
  });

  it('offers a dual prefix with each effect at its own value', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const prefix = service.getValuesForSlotML('Armor', 'Prefix', 34);
    const single = (name: string) => prefix.options.find(option =>
      option.affixes.length === 1 && option.affixes[0].name === name)!.affixes[0];
    const healthy = prefix.options.find(option =>
      option.affixes.map(affix => affix.name).join(',') === 'Constitution,Vitality');

    expect(healthy?.affixes.map(affix => [affix.name, affix.value, affix.type])).toEqual([
      ['Constitution', single('Constitution').value, single('Constitution').type],
      ['Vitality', single('Vitality').value, single('Vitality').type],
    ]);
    expect(healthy?.affixes[0].value).not.toBe(healthy?.affixes[1].value);
    // Shown, and carried in build URLs, by the name the crafting device uses.
    expect(healthy?.describe()).toBe('Healthy');
    expect(healthy?.getParamDescription()).toBe('Healthy');
  });

  it('keeps a dual prefix selected when the item\'s minimum level changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item(null);
    item.name = 'Essence Crafting Armor';
    item.slot = 'Armor';
    item.ml = 34;
    item.crafting = service.getValuesForML('Armor', item.ml);
    const prefix = item.crafting[0];
    prefix.selected = prefix.options.find(option => option.name === 'Healthy')!;

    service.setItemToML(item, 20);

    expect(item.crafting[0].selected?.name).toBe('Healthy');
    expect(item.crafting[0].selected?.affixes.map(affix => affix.value)).toEqual(
      service.getValuesForSlotML('Armor', 'Prefix', 20).options.find(option => option.name === 'Healthy')!
        .affixes.map(affix => affix.value));
  });

  it('offers a weapon dual prefix as two present-only effects', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const prefix = service.getValuesForSlotML('Melee', 'Prefix', 20);
    const annihilating = prefix.options.find(option => option.affixes.some(affix => affix.name === 'Slay Living'));

    expect(annihilating?.affixes.map(affix => [affix.name, affix.value, affix.type])).toEqual([
      ['Entropic', 1, 'Bool'],
      ['Slay Living', 1, 'Bool'],
    ]);
  });

  it('values elemental resistance by its own progression, still matching old links at the same ML', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const select = (ml: number, slot: string, desc: string) => {
      const craftable = service.getValuesForML('Cloak', ml).find(candidate => candidate.name === slot)!;
      return craftable.selectByParamDescription(desc) ? craftable.selected?.affixes.map(affix => [affix.name, affix.value, affix.type]) : null;
    };

    // These used the saves progression (Resistance +12 at ML 36), and old links carry that value.
    expect(select(36, 'Prefix', 'Fire Resistance60')).toEqual([['Fire Resistance', 60, 'Enhancement']]);
    expect(select(36, 'Prefix', 'Fire Resistance12')).toEqual([['Fire Resistance', 60, 'Enhancement']]);
    // An old value maps by the item's ML: +2 was ML 2 and ML 3.
    expect(select(2, 'Prefix', 'Cold Resistance2')).toEqual([['Cold Resistance', 7, 'Enhancement']]);
    expect(select(3, 'Prefix', 'Cold Resistance2')).toEqual([['Cold Resistance', 8, 'Enhancement']]);
    expect(select(3, 'Prefix', 'Cold Resistance12')).toBeNull();
    expect(select(36, 'Suffix', 'Fire Resistance12')).toEqual([['Fire Resistance', 29, 'Insight']]);
    expect(select(36, 'Suffix', 'Fire Resistance29')).toEqual([['Fire Resistance', 29, 'Insight']]);
    // The dual prefixes built on it too, each half from its own row: elemental +60, saves +12.
    expect(select(36, 'Prefix', 'Flame Resistant')).toEqual([['Fire Resistance', 60, 'Enhancement'], ['Resistance', 12, 'Resistance']]);
  });

  it('uses the generated Essence Crafting max level for selectable levels', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    expect(service.maxLevel).toBe(36);
    expect(service.levels[0]).toBe(service.maxLevel);
  });

  it('rebuilds generated weapon blanks from their Essence Crafting type when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item(null);
    item.name = 'Essence Crafting Melee';
    item.slot = 'Weapon';
    item.ml = 34;
    item.crafting = service.getValuesForML('Melee', item.ml);

    service.setItemToML(item, 30);

    expect(item.crafting.length).toBe(3);
    expect(item.crafting.every(craftable => craftable.options.length > 1)).toBe(true);
  });

  it('rebuilds crafted items from their raw Essence Crafting system when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item({
      name: 'Crafted Rune Arm',
      slot: 'Offhand',
      type: 'Rune Arms',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Rune_Arm',
      crafting: [
        'Essence Crafting: Rune Arm - Extra',
        'Essence Crafting: Rune Arm - Prefix',
        'Essence Crafting: Rune Arm - Suffix',
      ],
      quests: [],
      artifact: false,
    });
    item.crafting = service.getValuesForML('Rune Arm', item.ml);

    service.setItemToML(item, 30);

    expect(item.crafting.length).toBe(3);
    expect(item.crafting.every(craftable => craftable.options.length > 1)).toBe(true);
  });

  it('rebuilds cloned crafted items from their raw Essence Crafting system when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item({
      name: 'Crafted Rune Arm',
      slot: 'Offhand',
      type: 'Rune Arms',
      ml: 34,
      affixes: [],
      sets: [],
      url: '/page/Crafted_Rune_Arm',
      crafting: [
        'Essence Crafting: Rune Arm - Extra',
        'Essence Crafting: Rune Arm - Prefix',
        'Essence Crafting: Rune Arm - Suffix',
      ],
      quests: [],
      artifact: false,
    });
    item.crafting = service.getValuesForML('Rune Arm', item.ml);

    const clone = new Item(item);

    service.setItemToML(clone, 30);

    expect(clone.rawCrafting).toEqual([
      'Essence Crafting: Rune Arm - Extra',
      'Essence Crafting: Rune Arm - Prefix',
      'Essence Crafting: Rune Arm - Suffix',
    ]);
    expect(clone.crafting.length).toBe(3);
    expect(clone.crafting.every(craftable => craftable.options.length > 1)).toBe(true);
  });

  it('preserves non-essence crafting rows when ML changes', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const item = new Item(null);
    const augmentSlot = new Craftable('Augment Slot 1', []);
    augmentSlot.setCraftingSystemOptions(new Map([
      ['Blue Augment Slot', [new CraftableOption({ name: 'Sapphire of Test' })]],
    ]), 'Blue Augment Slot');
    item.name = 'Essence Crafting Armor';
    item.slot = 'Armor';
    item.ml = 36;
    item.crafting = service.getValuesForML('Armor', item.ml).concat([augmentSlot]);

    service.setItemToML(item, 30);

    expect(item.crafting.map(craftable => craftable.name)).toEqual([
      'Prefix',
      'Suffix',
      'Extra',
      'Augment Slot 1',
    ]);
    expect(item.getCraftingByName('Augment Slot 1')?.selectedCraftingSystemName).toBe('Blue Augment Slot');
  });

  it('collects affixes across every essence crafting item type, not just the last one', () => {
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const affixes = service.getAllAffixesForML(service.maxLevel);

    const affixNames = new Set(affixes.map(affix => affix.name));
    expect(affixNames.has('Transmutation Focus')).toBe(true);

    const transmutationValues = affixes
      .filter(affix => affix.name === 'Transmutation Focus')
      .map(affix => affix.value);
    expect(Math.max(...transmutationValues)).toBeGreaterThan(2);
  });

  it('gives checklist options such as Bashing a value of 1', () => {
    // The wiki lists Bashing's progression as damage dice ("1d6"); the data
    // builder must still emit 1, or the crafted affix never counts as covered.
    const service: EssenceCraftingService = TestBed.inject(EssenceCraftingService);
    const bashing = service.getValuesForML('Shield', 20)
      .flatMap(craftable => craftable.options)
      .flatMap(option => option.affixes)
      .find(affix => affix.name === 'Bashing');

    expect(bashing?.type).toBe('Bool');
    expect(bashing?.value).toBe(1);
  });
});
