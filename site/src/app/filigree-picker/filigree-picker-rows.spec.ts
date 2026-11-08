import { Affix } from '../affixes/affix';
import { buildFiligreeGroups, FiligreeFacts } from './filigree-picker-rows';

const affix = (name: string, value: number, type = 'Filigree') => new Affix({ name, value, type });

function facts(name: string, sets: string[], own: Affix[], setBonusNames: string[] = [], rare: Affix[] = []): FiligreeFacts {
  return {
    name, sets, affixes: own, rareAffixes: rare,
    ownBonusNames: own.map(a => a.name), rareBonusNames: rare.map(a => a.name), setBonusNames,
  };
}

const FILIGREES = [
  facts('Celerity: Dexterity', ['Celerity'], [affix('Dexterity', 1)], ['Doublestrike'], [affix('Physical Sheltering', 2)]),
  facts('Celerity: Reflex', ['Celerity'], [affix('Reflex Save', 2)], ['Doublestrike']),
  facts('Zephyr: Tumble', ['Zephyr'], [affix('Tumble', 2)]),
  facts('Celerity/Zephyr: Wisdom', ['Celerity', 'Zephyr'], [affix('Wisdom', 2)], ['Doublestrike']),
];

const base = {
  mode: 'set' as const,
  isTracked: (name: string) => name === 'Dexterity',
  inHost: new Set<string>(),
  search: '',
  hideIrrelevant: false,
  rare: true,
};

const summary = (groups: ReturnType<typeof buildFiligreeGroups>['groups']) =>
  groups.map(group => `${group.title}: ${group.entries.map(entry => entry.label).join(', ')}`);

describe('buildFiligreeGroups', () => {
  it('groups by set, a raid filigree under both, the groups that help first', () => {
    const { groups } = buildFiligreeGroups(FILIGREES, base);

    expect(summary(groups)).toEqual([
      'Celerity: Dexterity, Reflex, Wisdom',
      'Zephyr: Tumble, Wisdom',
    ]);
  });

  it('groups by bonus, under each bonus a filigree gives', () => {
    const { groups } = buildFiligreeGroups(FILIGREES, { ...base, mode: 'bonus' });

    expect(summary(groups)[0]).toBe('Dexterity: Celerity: Dexterity');
    expect(groups.map(group => group.title)).toEqual(['Dexterity', 'Reflex Save', 'Tumble', 'Wisdom']);
  });

  it('leaves the rare bonus out of the text, search and helping unless choosing a rare copy', () => {
    const normal = buildFiligreeGroups(FILIGREES, { ...base, rare: false, isTracked: name => name === 'Physical Sheltering' });
    const dexterity = normal.groups.flatMap(group => group.entries).find(entry => entry.name === 'Celerity: Dexterity')!;

    expect(dexterity.rareText).toBe('');
    expect(dexterity.relevant).toBe(false);
    expect(buildFiligreeGroups(FILIGREES, { ...base, rare: false, search: 'sheltering' }).groups).toEqual([]);

    const rare = buildFiligreeGroups(FILIGREES, { ...base, rare: true, isTracked: name => name === 'Physical Sheltering' });
    expect(rare.groups[0].entries[0]).toEqual(expect.objectContaining({
      name: 'Celerity: Dexterity', rareText: 'Physical Sheltering +2', relevant: true, className: 'Best',
    }));
  });

  it('searches names and bonuses, rare ones included for a rare copy', () => {
    expect(summary(buildFiligreeGroups(FILIGREES, { ...base, search: 'sheltering' }).groups))
      .toEqual(['Celerity: Dexterity']);
    expect(summary(buildFiligreeGroups(FILIGREES, { ...base, search: 'zephyr' }).groups))
      .toEqual(['Celerity: Wisdom', 'Zephyr: Tumble, Wisdom']);
  });

  it('hides what gives no tracked affix, keeping the current choice and counting the rest', () => {
    const { groups, hiddenCount } = buildFiligreeGroups(FILIGREES, {
      ...base, isTracked: name => name === 'Doublestrike', hideIrrelevant: true, current: 'Zephyr: Tumble',
    });

    // Within a group, the ones that help come first.
    expect(summary(groups)).toEqual(['Celerity: Dexterity, Reflex, Wisdom', 'Zephyr: Wisdom, Tumble']);
    expect(hiddenCount).toBe(0);

    const tumbleHidden = buildFiligreeGroups(FILIGREES, { ...base, isTracked: name => name === 'Doublestrike', hideIrrelevant: true });
    expect(tumbleHidden.hiddenCount).toBe(1);
  });

  it('hides nothing while nothing tracked is on offer', () => {
    const { hiddenCount } = buildFiligreeGroups(FILIGREES, { ...base, isTracked: () => false, hideIrrelevant: true });

    expect(hiddenCount).toBe(0);
  });

  it('ranks a filigree already in the host as a set piece only', () => {
    const { groups } = buildFiligreeGroups(FILIGREES, { ...base, inHost: new Set(['Celerity: Dexterity']) });
    const dexterity = groups[0].entries.find(entry => entry.name === 'Celerity: Dexterity')!;

    expect(dexterity.duplicate).toBe(true);
    expect(dexterity.className).toBe('Outranked');
  });

  it('marks one giving a tracked affix as helping', () => {
    const { groups } = buildFiligreeGroups(FILIGREES, base);

    expect(groups[0].entries[0]).toEqual(expect.objectContaining({
      name: 'Celerity: Dexterity', className: 'Best', relevant: true,
      affixText: 'Dexterity +1', rareText: 'Physical Sheltering +2',
    }));
  });
});
