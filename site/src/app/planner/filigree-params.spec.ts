import { emptyFiligreeLoadout } from '../gear/filigree';
import { parseFiligreeLoadout, serializeFiligreeLoadout } from './filigree-params';

const known = (name: string) => name !== 'Retired: Strength';

describe('filigree params', () => {
  it('writes nothing for an empty loadout', () => {
    expect(serializeFiligreeLoadout(emptyFiligreeLoadout())).toBeNull();
  });

  it('writes each host\'s filigrees in order, marking rare copies, leaving an empty host out', () => {
    const loadout = emptyFiligreeLoadout();
    loadout.weapon = [{ name: 'Celerity: Dexterity', rare: true }, { name: 'Celerity: Dexterity', rare: false }];

    expect(JSON.parse(serializeFiligreeLoadout(loadout)!)).toEqual({
      w: [['Celerity: Dexterity', 1], ['Celerity: Dexterity']],
    });
  });

  it('round-trips, filigrees past what a host holds included', () => {
    const loadout = emptyFiligreeLoadout();
    loadout.weapon = [{ name: 'Celerity: Reflex', rare: true }];
    loadout.artifact = [1, 2, 3, 4, 5, 6].map(() => ({ name: 'Celerity: Reflex', rare: false }));

    expect(parseFiligreeLoadout(serializeFiligreeLoadout(loadout), known)).toEqual(loadout);
  });

  it('drops what it cannot use rather than the whole loadout', () => {
    const raw = JSON.stringify({
      w: [['Celerity: Dexterity'], ['Retired: Strength'], 'junk', [7], ['Celerity: Reflex', 1]],
      a: 'junk',
    });

    expect(parseFiligreeLoadout(raw, known)).toEqual({
      weapon: [{ name: 'Celerity: Dexterity', rare: false }, { name: 'Celerity: Reflex', rare: true }],
      artifact: [],
    });
  });

  it('reads nothing from a missing or unparseable param', () => {
    expect(parseFiligreeLoadout(null, known)).toEqual(emptyFiligreeLoadout());
    expect(parseFiligreeLoadout('{not json', known)).toEqual(emptyFiligreeLoadout());
  });
});
