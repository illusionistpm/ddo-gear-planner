import { TestBed } from '@angular/core/testing';

import { BuildUrlCodecService, SLOT_TO_CODE } from './build-url-codec.service';
import { FIXED_BUILD_PARAM_KEYS } from './build-param-keys';
import { GearDbService } from '../gear/gear-db.service';
import urlCodecDictionary from 'src/assets/url-codec-dictionary.json';

const KNOWN_SLOT_KEYS = Object.keys(SLOT_TO_CODE);

describe('BuildUrlCodecService', () => {
  let service: BuildUrlCodecService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BuildUrlCodecService);
  });

  // Slots are data-driven (GearDbService.getSlots()), so a new slot in the
  // game data would otherwise fall through to the uncompressed passthrough
  // field and quietly grow every shared URL. Fail here instead.
  it('has a compact code for every slot the game data defines', () => {
    const slots = TestBed.inject(GearDbService).getSlots();

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.filter(slot => !SLOT_TO_CODE[slot])).toEqual([]);
  });

  it('round-trips representative build params', () => {
    const encoded = service.encode({
      levelrange: '1,36',
      raids: true,
      rare: true,
      hiddentypes: 'Bastard Swords,Battle Axes',
      hiddenpacks: '',
      Weapon: 'Dinosaur Bone Great Crossbow',
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Iridiscent Claw: Force',
      craft_1_slot: 'Weapon',
      craft_1_system: 'Fang (Weapon)',
      craft_1_selected: 'Meltfang',
      ml_Weapon: 36,
      tracked: ['Intelligence', 'False Life (%)'],
      tab: 'affixes'
    });

    expect(service.decode(encoded)).toEqual({
      levelrange: '1,36',
      raids: 'true',
      rare: 'true',
      hiddentypes: 'Bastard Swords,Battle Axes',
      Weapon: 'Dinosaur Bone Great Crossbow',
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Iridiscent Claw: Force',
      craft_1_slot: 'Weapon',
      craft_1_system: 'Fang (Weapon)',
      craft_1_selected: 'Meltfang',
      ml_Weapon: '36',
      tracked: ['Intelligence', 'False Life (%)'],
      tab: 'affixes'
    });
  });

  // Craftable encodes a system-scoped selection as "<system>: <option>", or
  // "<system> (empty)" for a system with nothing chosen yet (see
  // craftable.spec.ts). Those strings travel in the URL, colon and all.
  it('round-trips a system-scoped crafting selection and its (empty) sentinel', () => {
    for (const selected of ['Blue Augment Slot: Diamond of Constitution +15', 'Blue Augment Slot (empty)']) {
      const params = {
        Armor: 'Chainmail of the First Snow',
        craft_0_slot: 'Armor',
        craft_0_system: 'Augment Slot 1',
        craft_0_selected: selected,
      };

      expect(service.decode(service.encode(params))).toEqual(params);
    }
  });

  it('stores hidden type and pack filters as stable dictionary bitfields', () => {
    const encoded = service.encode({
      hiddentypes: 'Bastard Swords,Battle Axes',
      hiddenpacks: '__NO_PACK__,Masterminds of Sharn'
    });
    const inspection = service.inspect(encoded);
    const dictionary = urlCodecDictionary as {
      itemTypes: string[];
      packs: string[];
    };

    expect(inspection.compactPayload?.f?.ht).toBe(bitfieldFor([
      dictionary.itemTypes.indexOf('Bastard Swords'),
      dictionary.itemTypes.indexOf('Battle Axes')
    ]));
    expect(inspection.compactPayload?.f?.hp).toBe(bitfieldFor([
      dictionary.packs.indexOf('__NO_PACK__'),
      dictionary.packs.indexOf('Masterminds of Sharn')
    ]));
    expect(service.decode(encoded)).toEqual({
      hiddentypes: 'Bastard Swords,Battle Axes',
      hiddenpacks: '__NO_PACK__,Masterminds of Sharn'
    });
  });

  it('keeps unknown hidden filter values as bitfield text fallbacks', () => {
    const encoded = service.encode({
      hiddentypes: 'Brand New Weapon Type',
      hiddenpacks: 'Brand New Pack'
    });

    expect(service.inspect(encoded).compactPayload?.f).toEqual({
      ht: ['0', 'Brand New Weapon Type'],
      hp: ['0', 'Brand New Pack']
    });
    expect(service.decode(encoded)).toEqual({
      hiddentypes: 'Brand New Weapon Type',
      hiddenpacks: 'Brand New Pack'
    });
  });

  it('stores crafting system names as stable dictionary IDs', () => {
    const encoded = service.encode({
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Iridiscent Claw: Force'
    });
    const inspection = service.inspect(encoded);
    const dictionary = urlCodecDictionary as {
      craftingSystems: string[];
    };

    expect(inspection.compactPayload?.c?.[0]).toEqual([
      'w',
      dictionary.craftingSystems.indexOf('Claw (Weapon)'),
      'Iridiscent Claw: Force'
    ]);
    expect(service.decode(encoded)).toEqual({
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Iridiscent Claw: Force'
    });
  });

  it('emits a URL-safe compressed payload', () => {
    const encoded = service.encode({ Weapon: 'Dinosaur Bone Great Crossbow' });

    expect(encoded).toMatch(/^z1\./);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('does not duplicate the version inside the payload - the z1. prefix already carries it', () => {
    const encoded = service.encode({ Weapon: 'Dinosaur Bone Great Crossbow' });

    expect(service.inspect(encoded).compactPayload).not.toEqual(expect.objectContaining({ v: expect.anything() }));
    expect(service.decode(encoded)).toEqual({ Weapon: 'Dinosaur Bone Great Crossbow' });
  });

  it('returns null for invalid compact params', () => {
    expect(service.decode('z1.not-valid')).toBeNull();
    expect(service.decode('j1.not-supported')).toBeNull();
  });

  it('preserves repeated tracked params and crafting order', () => {
    const encoded = service.encode({
      craft_10_slot: 'Gloves',
      craft_10_system: 'T2 (Equipment)',
      craft_10_selected: 'Intelligence Skills11|Wizardry151',
      craft_2_slot: 'Weapon',
      craft_2_system: 'Horn (Weapon)',
      craft_2_selected: 'Flamehorn',
      tracked: ['Wizardry', 'Spell Penetration', 'Disable Device']
    });

    expect(service.decode(encoded)).toEqual({
      craft_0_slot: 'Weapon',
      craft_0_system: 'Horn (Weapon)',
      craft_0_selected: 'Flamehorn',
      craft_1_slot: 'Gloves',
      craft_1_system: 'T2 (Equipment)',
      craft_1_selected: 'Intelligence Skills11|Wizardry151',
      tracked: ['Wizardry', 'Spell Penetration', 'Disable Device']
    });
  });

  it('gives every known build-data key an explicit encode/decode case, not just generic passthrough', () => {
    const sampleValueByKey: Record<string, string | boolean | string[]> = {
      tracked: ['Strength'],
      levelrange: '1,20',
      raids: true,
      rare: true,
      hiddentypes: 'Bastard Swords',
      hiddenpacks: 'Some Pack',
      nongear: JSON.stringify([
        { id: '1', affixName: 'Deadly', bonusType: 'Insightful', kind: 'value', value: 6, label: 'Trance' }
      ])
    };

    for (const key of FIXED_BUILD_PARAM_KEYS) {
      const encoded = service.encode({ [key]: sampleValueByKey[key] });
      const inspection = service.inspect(encoded);

      expect(inspection.compactPayload?.x?.[key], `"${key}" fell through to generic passthrough instead of an explicit codec case`).toBeUndefined();
    }

    for (const slot of KNOWN_SLOT_KEYS) {
      const encoded = service.encode({ [slot]: 'Some Item' });
      const inspection = service.inspect(encoded);

      expect(inspection.compactPayload?.g?.[Object.keys(inspection.compactPayload?.g ?? {})[0]], `slot "${slot}" was not encoded into the gear (g) field`).toBe('Some Item');
      expect(inspection.compactPayload?.x?.[slot]).toBeUndefined();
    }

    const mlEncoded = service.encode({ ml_Weapon: 20 });
    expect(service.inspect(mlEncoded).compactPayload?.ml).toBeDefined();
    expect(service.inspect(mlEncoded).compactPayload?.x?.['ml_Weapon']).toBeUndefined();

    const craftEncoded = service.encode({
      craft_0_slot: 'Weapon',
      craft_0_system: 'Claw (Weapon)',
      craft_0_selected: 'Test Selection'
    });
    expect(service.inspect(craftEncoded).compactPayload?.c?.length).toBe(1);
    expect(service.inspect(craftEncoded).compactPayload?.x).toBeUndefined();
  });

  it('stores non-gear affix entries as positional tuples, regenerating ids on decode', () => {
    const encoded = service.encode({
      nongear: JSON.stringify([
        { id: '7', affixName: 'Deadly', bonusType: 'Insightful', kind: 'value', value: 6, label: 'Trance' },
        { id: '9', affixName: 'Concentration', bonusType: 'Insight', kind: 'ignored', value: 0, label: 'Not chasing' }
      ])
    });
    const inspection = service.inspect(encoded);

    expect(inspection.compactPayload?.e).toEqual([
      ['Deadly', 'Insightful', 'v', 6, 'Trance'],
      ['Concentration', 'Insight', 'i', 0, 'Not chasing']
    ]);
    expect(inspection.compactPayload?.x?.['nongear']).toBeUndefined();

    const decoded = service.decode(encoded);
    expect(JSON.parse(decoded!['nongear'] as string)).toEqual([
      { id: '1', affixName: 'Deadly', bonusType: 'Insightful', kind: 'value', value: 6, label: 'Trance' },
      { id: '2', affixName: 'Concentration', bonusType: 'Insight', kind: 'ignored', value: 0, label: 'Not chasing' }
    ]);
  });

  it('works when performance logging is enabled', () => {
    vi.spyOn(console, 'log').mockReturnValue(undefined);
    localStorage.setItem('ddoPerf', '1');
    try {
      const encoded = service.encode({ tracked: ['Strength'] });
      expect(service.decode(encoded)).toEqual({ tracked: ['Strength'] });
    }
    finally {
      localStorage.removeItem('ddoPerf');
    }
  });
});

function bitfieldFor(indexes: number[]) {
  let bitfield = 0n;
  for (const index of indexes) {
    bitfield |= 1n << BigInt(index);
  }
  return bitfield.toString(36);
}
