import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { AffixService } from './affix.service';
import { AffixUiService } from './affix-ui.service';
import { CraftableOption } from '../gear/craftable-option';

describe('AffixUiService', () => {
  it('describes fixed affix group components', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Songblade', ['Perform']);
    affixSvc.affixGroupComponents.set('Songblade', [
      new Affix({ name: 'Perform', type: 'Enhancement', value: 2 })
    ]);

    const service = new AffixUiService({} as any, affixSvc, {} as any);

    expect(service.getAffixGroupTooltip(new Affix({ name: 'Songblade', type: 'Bool', value: 1 })))
      .toBe('Songblade is:\n- Perform: +2 Enhancement');
  });

  it('describes fixed affix group components with inherited values', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Lifesealed', ['Negative Energy Absorption', 'Deathblock']);
    affixSvc.affixGroupComponents.set('Lifesealed', [
      { name: 'Negative Energy Absorption', type: '<TypeAlreadyParsed>', value: '<ValueAlreadyParsed>' },
      { name: 'Deathblock', type: 'Bool', value: 1 }
    ]);

    const service = new AffixUiService({} as any, affixSvc, {} as any);

    expect(service.getAffixGroupTooltip(new Affix({ name: 'Lifesealed', type: 'Enhancement', value: 28 })))
      .toBe('Lifesealed is:\n- Negative Energy Absorption: +28 Enhancement\n- Deathblock');
  });

  it('describes regular affix group components with inherited values', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Purifying Flame Lore', ['Fire Lore', 'Radiance Lore']);

    const service = new AffixUiService({} as any, affixSvc, {} as any);

    expect(service.getAffixGroupTooltip(new Affix({ name: 'Purifying Flame Lore', type: 'Enhancement', value: 21 })))
      .toBe('Purifying Flame Lore is:\n- Fire Lore: +21 Enhancement\n- Radiance Lore: +21 Enhancement');
  });

  it('shows filigree slots as a count, without the Untyped bonus type', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any);
    const filigree = new Affix({ name: 'Max Filigree Slots', type: 'Untyped', value: '3' });

    expect(service.getAffixValueText(filigree)).toBe('3 slots');
    expect(service.getCraftingOptionTooltip({ name: 'Artifact', affixes: [filigree] } as any))
      .toBe('Artifact is:\n- Max Filigree Slots: 3 slots');
    expect(service.getAffixValueText(new Affix({ name: 'Dexterity', type: 'Enhancement', value: 14 })))
      .toBe('+14 Enhancement');
  });

  it('describes crafting option affixes', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any);
    const option = { name: 'Flamehorn', affixes: [new Affix({ name: 'Legendary Ash', type: 'Bool', value: 1 })] } as any;

    expect(service.getCraftingOptionTooltip(option))
      .toBe('Flamehorn is:\n- Legendary Ash');
  });

  it('expands crafting option affix groups', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('All Skills', ['Balance', 'Spot']);
    const service = new AffixUiService({} as any, affixSvc, {} as any);
    const option = {
      name: 'Skill Gem',
      affixes: [new Affix({ name: 'All Skills', type: 'Competence', value: 5 })]
    } as any;

    expect(service.getCraftingOptionTooltip(option))
      .toBe('Skill Gem is:\n- Balance: +5 Competence\n- Spot: +5 Competence');
  });

  it('ranks crafting options using all affixes', () => {
    const equipped = {
      getAffixRanking: (affix: Affix) => affix.name === 'Alchemical Earth Attunement'
        ? AffixRank.Best
        : AffixRank.Irrelevant
    };
    const service = new AffixUiService(equipped as any, new AffixService(), {} as any);
    const option = {
      affixes: [
        new Affix({ name: 'Evil Aligned', type: 'Bool', value: 1 }),
        new Affix({ name: 'Alchemical Earth Attunement', type: 'Bool', value: 1 })
      ]
    } as any;

    expect(service.getClassForCraftingOption(option)).toBe(AffixRank[AffixRank.Best]);
  });

  it('ranks universal spell lore using its spell lore components', () => {
    const equipped = {
      getAffixRanking: (affix: Affix) => affix.name === 'Force Lore'
        ? AffixRank.Best
        : AffixRank.Irrelevant
    };
    const service = new AffixUiService(equipped as any, new AffixService(), {} as any);
    const universalLore = new Affix({ name: 'Universal Spell Lore', type: 'Exceptional', value: 5 });

    expect(service.getClassForAffix(universalLore)).toBe(AffixRank[AffixRank.Best]);
    expect(service.getAffixTooltip(universalLore)).toBe('Best equipped value');
  });

  it('preserves the source type and value when expanding universal spell effects', () => {
    const affixService = new AffixService();
    const universalPower = affixService.ungroupAffix(new Affix({
      name: 'Universal Spell Power',
      type: 'Artifact',
      value: 15,
    }));
    const universalLore = affixService.ungroupAffix(new Affix({
      name: 'Universal Spell Lore',
      type: 'Exceptional',
      value: 5,
    }));

    expect(universalPower.find(affix => affix.name === 'Force Spell Power')).toEqual(expect.objectContaining({
      type: 'Artifact',
      value: 15,
    }));
    expect(universalLore.find(affix => affix.name === 'Force Lore')).toEqual(expect.objectContaining({
      type: 'Exceptional',
      value: 5,
    }));
  });

  describe('describeExternalAffix', () => {
    const service = new AffixUiService({} as any, {} as any, {} as any);
    const entry = (overrides: object) => ({
      id: '1', affixName: 'Strength', bonusType: 'Insight', kind: 'value' as const, value: 3, label: 'Spell', ...overrides
    });

    it('shows a value entry as its signed value and bonus type', () => {
      expect(service.describeExternalAffix(entry({}))).toBe('+3 Insight');
    });

    it('shows a checklist entry as covered', () => {
      expect(service.describeExternalAffix(entry({ bonusType: 'Bool', value: 1 }))).toBe('Covered');
    });

    it('shows an ignored entry as its bonus type, or Ignored for a checklist', () => {
      expect(service.describeExternalAffix(entry({ kind: 'ignored', value: 0 }))).toBe('Insight');
      expect(service.describeExternalAffix(entry({ kind: 'ignored', bonusType: 'Bool', value: 0 }))).toBe('Ignored');
    });

    it('appends the label on request', () => {
      expect(service.describeExternalAffix(entry({}), true)).toBe('+3 Insight (Spell)');
      expect(service.describeExternalAffix(entry({ bonusType: 'Bool', value: 1 }), true)).toBe('Covered (Spell)');
    });
  });

  describe('set augments', () => {
    const quickblade = [
      new Affix({ name: 'Doublestrike', type: 'Artifact', value: 15 }),
      new Affix({ name: 'Doubleshot', type: 'Artifact', value: 15 }),
    ];

    function makeService(ranks: Record<string, AffixRank>) {
      const equipped = {
        getAffixRanking: (affix: Affix) => ranks[affix.name] ?? AffixRank.Irrelevant,
        // No pieces of any set equipped.
        getActiveSets: () => new Map<string, number>(),
      };
      const gearDb = {
        getSetBonusThresholdDetails: (set: string) => set === 'Quickblade' ? [{ threshold: 3, eligible: false, affixes: quickblade }] : [],
        getSetBonusThresholds: (set: string) => set === 'Quickblade' ? [3] : [],
      };
      return new AffixUiService(equipped as any, new AffixService(), gearDb as any);
    }
    const setAugment = new CraftableOption({ name: 'Set Augment: Quickblade', set: 'Quickblade' });

    it('are ranked by their set bonus, as if the set were complete', () => {
      expect(makeService({ Doublestrike: AffixRank.BetterThanBest }).getClassForCraftingOption(setAugment)).toBe('BetterThanBest');
      expect(makeService({ Doublestrike: AffixRank.Outranked }).getClassForCraftingOption(setAugment)).toBe('Outranked');
    });

    it('are Mixed when their set bonuses rank differently', () => {
      const service = makeService({ Doublestrike: AffixRank.BetterThanBest, Doubleshot: AffixRank.Outranked });

      expect(service.getClassForCraftingOption(setAugment)).toBe('Mixed');
    });

    it('are irrelevant when no set bonus is tracked', () => {
      expect(makeService({}).getClassForCraftingOption(setAugment)).toBe('Irrelevant');
    });

    it('are ranked for a list with the set pieces they would make, while the set is short', () => {
      const ranking = makeService({ Doublestrike: AffixRank.Best }).rankCraftingOption(setAugment);

      expect(ranking.className).toBe('Best');
      expect(ranking.note).toBe('1 of 3 set pieces');
      expect(ranking.tooltip).toContain('Quickblade set bonus at 3 pieces');
    });

    it('describe their set bonus and the pieces it takes', () => {
      expect(makeService({}).getCraftingOptionTooltip(setAugment))
        .toBe('Quickblade set bonus at 3 pieces:\n- Doublestrike: +15 Artifact\n- Doubleshot: +15 Artifact');
    });
  });

  describe('getSetPieces', () => {
    function makeService(piecesEquipped: number) {
      const equipped = { getActiveSets: () => new Map([['Quickblade', piecesEquipped]]) };
      const gearDb = { getSetBonusThresholds: () => [3] };
      return new AffixUiService(equipped as any, new AffixService(), gearDb as any);
    }
    const setAugment = new CraftableOption({ name: 'Set Augment: Quickblade', set: 'Quickblade' });

    it('counts the augment itself as a piece', () => {
      expect(makeService(0).getSetPieces(setAugment, false)).toEqual({ pieces: 1, required: 3 });
      expect(makeService(2).getSetPieces(setAugment, false)).toEqual({ pieces: 3, required: 3 });
    });

    it('does not count the augment twice when it is already an equipped piece', () => {
      expect(makeService(1).getSetPieces(setAugment, true)).toEqual({ pieces: 1, required: 3 });
    });

    it('has nothing to say about an option that is not a set augment', () => {
      expect(makeService(0).getSetPieces(new CraftableOption({ name: 'Plain' }), false)).toBeNull();
    });
  });
});
