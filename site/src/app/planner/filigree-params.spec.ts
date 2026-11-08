import { emptyFiligreeLoadout } from '../gear/filigree';
import { parseFiligreeLoadout, serializeFiligreeLoadout } from './filigree-params';

const known = (name: string) => name !== 'Retired: Strength';

describe('filigree params', () => {
  it('writes nothing for an untouched loadout', () => {
    expect(serializeFiligreeLoadout(emptyFiligreeLoadout())).toBeNull();
  });

  it('writes slot positions, rare copies and changed slot counts, leaving defaults out', () => {
    const loadout = emptyFiligreeLoadout();
    loadout.weaponSlots = 7;
    loadout.weapon[0] = { name: 'Celerity: Dexterity', rare: true };
    loadout.weapon[4] = { name: 'Celerity: Dexterity', rare: false };
    loadout.artifact[1] = { name: 'Zephyr: Tumble', rare: false };

    expect(JSON.parse(serializeFiligreeLoadout(loadout)!)).toEqual({
      ws: 7,
      w: [[0, 'Celerity: Dexterity', 1], [4, 'Celerity: Dexterity']],
      a: [[1, 'Zephyr: Tumble']],
    });
  });

  it('round-trips', () => {
    const loadout = emptyFiligreeLoadout();
    loadout.artifactSlots = 2;
    loadout.weapon[9] = { name: 'Celerity: Reflex', rare: true };
    loadout.artifact[0] = { name: 'Celerity: Reflex', rare: false };

    expect(parseFiligreeLoadout(serializeFiligreeLoadout(loadout), known)).toEqual(loadout);
  });

  it('drops what it cannot use rather than the whole loadout', () => {
    const raw = JSON.stringify({
      ws: 11,
      as: 0,
      w: [[0, 'Celerity: Dexterity'], [10, 'Celerity: Reflex'], [1, 'Retired: Strength'], 'junk', [2, 7]],
      a: 'junk',
    });

    const loadout = parseFiligreeLoadout(raw, known);

    expect(loadout.weaponSlots).toBe(10);
    expect(loadout.artifactSlots).toBeNull();
    expect(loadout.weapon.filter(Boolean)).toEqual([{ name: 'Celerity: Dexterity', rare: false }]);
    expect(loadout.artifact.every(slot => slot === null)).toBe(true);
  });

  it('reads nothing from a missing or unparseable param', () => {
    expect(parseFiligreeLoadout(null, known)).toEqual(emptyFiligreeLoadout());
    expect(parseFiligreeLoadout('{not json', known)).toEqual(emptyFiligreeLoadout());
  });
});
