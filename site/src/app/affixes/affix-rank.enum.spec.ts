import { bestRankClass, compareRankClasses } from './affix-rank.enum';

describe('rank class ordering', () => {
  it('orders ranks from most to least useful to the build', () => {
    const shuffled = ['Irrelevant', 'Outranked', 'Best', 'Penalty', 'Mixed', 'BetterThanBest', 'BestTied'];

    expect([...shuffled].sort(compareRankClasses))
      .toEqual(['BetterThanBest', 'Best', 'BestTied', 'Mixed', 'Outranked', 'Penalty', 'Irrelevant']);
  });

  it('sorts unranked options last', () => {
    expect(compareRankClasses(undefined, 'Irrelevant')).toBeGreaterThan(0);
  });

  it('picks the best class of several', () => {
    expect(bestRankClass(['Outranked', undefined, 'BestTied', 'Irrelevant'])).toBe('BestTied');
  });

  it('is Irrelevant when nothing is ranked', () => {
    expect(bestRankClass([])).toBe('Irrelevant');
    expect(bestRankClass([undefined])).toBe('Irrelevant');
  });
});
