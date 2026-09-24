import { TestBed } from '@angular/core/testing';

import { BuildUrlCodecService } from './build-url-codec.service';
import urlCodecDictionary from '@data/url-codec-dictionary.json';

/**
 * Property-style round-trip: for a few hundred generated param records,
 * decode(encode(record)) must preserve every value the codec keeps. Written
 * before the encoder was reworked to use build-param-keys' builders, so it
 * pins the wire behaviour rather than the implementation.
 *
 * The generator is seeded, so a failure names a reproducible case.
 */

const dictionary = urlCodecDictionary as {
  itemTypes: string[];
  packs: string[];
  craftingSystems: string[];
};

const SLOTS = [
  'Weapon', 'Offhand', 'Armor', 'Belt', 'Boots', 'Bracers', 'Cloak',
  'Gloves', 'Goggles', 'Helm', 'Necklace', 'Ring1', 'Ring2', 'Trinket', 'Quiver'
];

// Real item/affix names are full of punctuation the payload has to survive.
const ITEM_NAMES = [
  'Dinosaur Bone Great Crossbow', "Legendary Dread Isle's Curse", 'Ring of the Stormreaver, Greater',
  'Epic Elyd Edge: Fang', 'Cloak of Night (Heroic)', 'Bauble +5', 'Essence Crafting Ring',
];
const AFFIX_NAMES = ['Constitution', 'False Life (%)', 'Spell Lore', 'Doublestrike', 'Physical Sheltering'];
const BONUS_TYPES = ['Enhancement', 'Insight', 'Quality', 'Artifact', 'Bool'];

/** Deterministic PRNG (mulberry32) so a failing case is reproducible from its seed. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Params = Record<string, string | number | boolean | string[]>;

function generate(random: () => number): Params {
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const chance = (p: number) => random() < p;
  const params: Params = {};

  const equipped = SLOTS.filter(() => chance(0.4));
  for (const slot of equipped) {
    params[slot] = pick(ITEM_NAMES);
    if (chance(0.3)) {
      params['ml_' + slot] = Math.floor(random() * 34) + 1;
    }
  }

  // Crafting triples are indexed contiguously: the codec renumbers them on
  // decode, and drops any triple missing one of its three parts.
  let craftIndex = 0;
  for (const slot of equipped) {
    if (chance(0.3)) {
      params[`craft_${craftIndex}_slot`] = slot;
      params[`craft_${craftIndex}_system`] = pick(dictionary.craftingSystems);
      params[`craft_${craftIndex}_selected`] = `${pick(AFFIX_NAMES)}: ${pick(BONUS_TYPES)}`;
      craftIndex++;
    }
  }

  if (chance(0.7)) {
    const low = Math.floor(random() * 30) + 1;
    params['levelrange'] = `${low},${low + Math.floor(random() * 6)}`;
  }
  if (chance(0.5))
    params['raids'] = chance(0.5);
  if (chance(0.5))
    params['rare'] = chance(0.5);
  if (chance(0.4))
    params['hiddentypes'] = dictionary.itemTypes.filter(() => chance(0.2)).join(',');
  if (chance(0.4))
    params['hiddenpacks'] = dictionary.packs.filter(() => chance(0.2)).join(',');
  if (chance(0.6))
    params['tracked'] = AFFIX_NAMES.filter(() => chance(0.5));
  if (chance(0.3)) {
    params['nongear'] = JSON.stringify([{
        id: '1', affixName: pick(AFFIX_NAMES), bonusType: pick(BONUS_TYPES),
        kind: chance(0.5) ? 'value' : 'ignored', value: Math.floor(random() * 20), label: 'Past life',
      }]);
  }
  // An unrecognised key rides along in the passthrough field.
  if (chance(0.2))
    params['someFutureKey'] = 'value';

  return params;
}

/**
 * What the codec keeps: values as strings, with empty ones dropped. A
 * repeatable param (`tracked`) stays an array even with a single value.
 */
function expected(params: Params): Record<string, string | string[]> {
  const kept: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    const values = (Array.isArray(value) ? value : [value]).map(String);
    if (!values.length || values.every(entry => entry === '')) {
      continue;
    }
    kept[key] = Array.isArray(value) ? values : values[0];
  }
  return kept;
}

describe('BuildUrlCodecService round-trip properties', () => {
  let service: BuildUrlCodecService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BuildUrlCodecService);
  });

  it('preserves every kept param across encode/decode, for 200 generated builds', () => {
    const random = makeRandom(20260919);

    for (let i = 0; i < 200; i++) {
      const params = generate(random);
      const decoded = service.decode(service.encode(params));
      const want = expected(params);
      const context = `case ${i}: ${JSON.stringify(params)}`;

      expect(decoded, context).not.toBeNull();
      expect(Object.keys(decoded ?? {}).sort(), context).toEqual(Object.keys(want).sort());

      for (const [key, value] of Object.entries(want)) {
        const actual = decoded?.[key];
        if (key === 'hiddentypes' || key === 'hiddenpacks') {
          // Dictionary sets come back in dictionary order, not input order.
          expect(String(actual).split(',').sort(), `${context} [${key}]`).toEqual(String(value).split(',').sort());
        }
        else {
          expect(actual, `${context} [${key}]`).toEqual(value);
        }
      }
    }
  });

  it('is stable: re-encoding a decoded record reproduces it exactly', () => {
    const random = makeRandom(7);

    for (let i = 0; i < 50; i++) {
      const once = service.decode(service.encode(generate(random)));
      const twice = service.decode(service.encode(once ?? {}));

      expect(twice, `case ${i}: ${JSON.stringify(once)}`).toEqual(once);
    }
  });
});
