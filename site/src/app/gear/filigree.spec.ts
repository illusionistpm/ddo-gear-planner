import {
  countFiligreeSetPieces, countHostFiligree, emptyFiligreeLoadout, FiligreeChoice, filigreeAffixes,
  isFiligreeLoadoutEmpty, maxFiligreeSetTotal, maxFiligreeTotal
} from './filigree';

const choice = (name: string, rare = false): FiligreeChoice => ({ name, rare });

describe('filigree rules', () => {
  describe('countHostFiligree', () => {
    it('counts only the open slots, skipping empty ones', () => {
      const counted = countHostFiligree('weapon', [choice('A'), null, choice('B'), choice('C')], 3);

      expect(counted.map(entry => [entry.index, entry.choice.name])).toEqual([[0, 'A'], [2, 'B']]);
      expect(counted.every(entry => entry.host === 'weapon' && entry.contributes)).toBe(true);
    });

    it('lets only the first copy of a duplicate give its bonuses', () => {
      const counted = countHostFiligree('artifact', [choice('A'), choice('A'), choice('B')], 3);

      expect(counted.map(entry => entry.contributes)).toEqual([true, false, true]);
    });

    it('prefers the rare copy of a duplicate, wherever it is', () => {
      const counted = countHostFiligree('weapon', [choice('A'), choice('A', true), choice('A')], 3);

      expect(counted.map(entry => entry.contributes)).toEqual([false, true, false]);
    });

    it('counts nothing with no open slots', () => {
      expect(countHostFiligree('artifact', [choice('A')], 0)).toEqual([]);
    });
  });

  describe('countFiligreeSetPieces', () => {
    it('counts every copy in both hosts, duplicates included, toward each of its sets', () => {
      const sets: Record<string, string[]> = { A: ['Celerity'], 'A/B': ['Celerity', 'Zephyr'] };
      const counted = [
        ...countHostFiligree('weapon', [choice('A'), choice('A'), choice('A/B')], 10),
        ...countHostFiligree('artifact', [choice('A')], 3),
      ];

      const pieces = countFiligreeSetPieces(counted, name => sets[name] ?? []);

      expect(Object.fromEntries(pieces)).toEqual({ Celerity: 4, Zephyr: 1 });
    });
  });

  describe('filigreeAffixes', () => {
    const raw = {
      sets: ['Celerity'],
      generation: '1',
      affixes: [{ name: 'Dexterity', type: 'Filigree', value: 1 }],
      rareAffixes: [{ name: 'Physical Sheltering', type: 'Filigree', value: 2 }],
    };

    it('adds the rare bonus only to the rare copy', () => {
      expect(filigreeAffixes(raw, false).map(affix => affix.name)).toEqual(['Dexterity']);
      expect(filigreeAffixes(raw, true).map(affix => [affix.name, affix.value])).toEqual([
        ['Dexterity', 1], ['Physical Sheltering', 2],
      ]);
    });

    it('is empty for an unknown filigree', () => {
      expect(filigreeAffixes(undefined, true)).toEqual([]);
    });
  });

  describe('maxFiligreeTotal', () => {
    it('sums the best ten for the weapon and the best of the artifact slots again for the artifact', () => {
      const values = [5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1];

      // Weapon: the best ten (20). Artifact of 3: 5 + 4 + 3.
      expect(maxFiligreeTotal(values, 3)).toBe(20 + 12);
    });

    it('is the weapon alone with no artifact, and ignores filigrees giving nothing', () => {
      expect(maxFiligreeTotal([2, 0, -1], 0)).toBe(2);
    });
  });

  describe('maxFiligreeSetTotal', () => {
    const fury = [2, 3, 4, 5, 6].map(threshold => ({ threshold, value: 1 }));
    const twoPiece = (value: number) => [{ threshold: 2, value }];

    it('adds up a set\'s tiers', () => {
      expect(maxFiligreeSetTotal([fury], 15)).toBe(5);
    });

    it('stacks distinct sets within the pieces there are', () => {
      // 15 pieces: Fury at 6 (+5) and all four 2-piece sets (8 pieces).
      expect(maxFiligreeSetTotal([fury, twoPiece(3), twoPiece(2), twoPiece(2), twoPiece(1)], 15)).toBe(5 + 3 + 2 + 2 + 1);
      // 11 pieces: Fury stopped at 5 pieces (+4) leaves room for three 2-piece sets, beating Fury at 6 with two.
      expect(maxFiligreeSetTotal([fury, twoPiece(3), twoPiece(2), twoPiece(2), twoPiece(1)], 11)).toBe(4 + 3 + 2 + 2);
      // 4 pieces: the two best 2-piece sets beat Fury's +3 at 4.
      expect(maxFiligreeSetTotal([fury, twoPiece(3), twoPiece(2)], 4)).toBe(5);
    });

    it('stops at a set\'s last tier that gives the affix, and gives nothing with no pieces', () => {
      expect(maxFiligreeSetTotal([[{ threshold: 4, value: 5 }, { threshold: 5, value: 0 }]], 15)).toBe(5);
      expect(maxFiligreeSetTotal([fury], 1)).toBe(0);
      expect(maxFiligreeSetTotal([], 15)).toBe(0);
    });
  });

  it('knows an untouched loadout is empty', () => {
    const loadout = emptyFiligreeLoadout();
    expect(isFiligreeLoadoutEmpty(loadout)).toBe(true);

    loadout.weaponSlots = 7;
    expect(isFiligreeLoadoutEmpty(loadout)).toBe(false);
  });
});
