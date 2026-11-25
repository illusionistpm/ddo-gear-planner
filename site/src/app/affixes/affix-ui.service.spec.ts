import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { AffixService } from './affix.service';
import { AffixUiService } from './affix-ui.service';
import { AffixDescriptionService } from './affix-description.service';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';

describe('AffixUiService', () => {
  it('puts the wiki text first and lists a compound affix\'s parts after it', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Paired Riposte', ['Armor Class']);
    const descriptions = new AffixDescriptionService();
    descriptions.use({ 'Paired Riposte': { '*': 'When Missed by an attack: Deals damage to your attacker.' } });
    const service = new AffixUiService({} as any, affixSvc, {} as any, descriptions);

    expect(service.getAffixDetails(new Affix({ name: 'Paired Riposte', type: 'Insight', value: 2 }))).toEqual({
      name: 'Paired Riposte',
      description: 'When Missed by an attack: Deals damage to your attacker.',
      wikiName: 'Paired Riposte',
      sections: [{ label: 'Counts toward', parts: [{ name: 'Armor Class', value: '+2 Insight' }] }],
    });
  });

  it('gives an ordinary affix its wiki text alone, and no details to an affix without any', () => {
    const descriptions = new AffixDescriptionService();
    descriptions.use({ Deadly: { '*': '+{v} {type} bonus to weapon damage.' } });
    const service = new AffixUiService({} as any, new AffixService(), {} as any, descriptions);

    expect(service.getAffixDetails(new Affix({ name: 'Deadly', type: 'Competence', value: 6 })))
      .toEqual({ name: 'Deadly', description: '+6 Competence bonus to weapon damage.', wikiName: 'Deadly', sections: [] });
    expect(service.getAffixDetails(new Affix({ name: 'Strength', type: 'Enhancement', value: 6 }))).toBeNull();
  });

  it('details what a crafting option grants, and what its one affix does', () => {
    const descriptions = new AffixDescriptionService();
    descriptions.use({ 'Legendary Ash': { '*': 'Your fire spells leave ash.' } });
    const service = new AffixUiService({} as any, new AffixService(), {} as any, descriptions);

    expect(service.getCraftingOptionDetails(new CraftableOption({ name: 'Flamehorn', affixes: [{ name: 'Legendary Ash', type: 'Bool', value: 1 }] })))
      .toEqual({
        name: 'Flamehorn', description: 'Your fire spells leave ash.', wikiName: 'Legendary Ash',
        sections: [{ label: 'Grants', parts: [{ name: 'Legendary Ash', value: '' }] }],
      });
    // Its label is its one affix: nothing to add.
    expect(service.getCraftingOptionDetails(new CraftableOption({ affixes: [{ name: 'Fire Spell Power', type: 'Equipment', value: 3 }] })))
      .toBeNull();
    expect(service.getCraftingOptionDetails(new CraftableOption({ name: 'Empty' }))).toBeNull();
  });

  it('names a whole family of parts at one value as one row', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any, new AffixDescriptionService());

    expect(service.getAffixDetails(new Affix({ name: 'Good Luck', type: 'Luck', value: 2 }))?.sections[0].parts).toEqual([
      { name: 'All saves', value: '+2 Luck' },
      { name: 'All skills', value: '+2 Luck' },
    ]);
    expect(service.getAffixDetails(new Affix({ name: 'Riposte', type: 'Insight', value: 2 }))?.sections[0].parts.map(part => part.name))
      .toEqual(['Armor Class', 'All saves']);
  });

  it('lists a family\'s members when they differ in value', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Uneven Saves', ['Fortitude Save', 'Reflex Save', 'Will Save']);
    affixSvc.affixGroupComponents.set('Uneven Saves', [
      new Affix({ name: 'Fortitude Save', type: 'Luck', value: 2 }),
      new Affix({ name: 'Reflex Save', type: 'Luck', value: 2 }),
      new Affix({ name: 'Will Save', type: 'Luck', value: 1 }),
    ]);
    const service = new AffixUiService({} as any, affixSvc, {} as any, new AffixDescriptionService());

    expect(service.getAffixDetails(new Affix({ name: 'Uneven Saves', type: 'Bool', value: 1 }))?.sections[0].parts.map(part => part.name))
      .toEqual(['Fortitude Save', 'Reflex Save', 'Will Save']);
  });

  it('describes fixed affix group components', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Songblade', ['Perform']);
    affixSvc.affixGroupComponents.set('Songblade', [
      new Affix({ name: 'Perform', type: 'Enhancement', value: 2 })
    ]);

    const service = new AffixUiService({} as any, affixSvc, {} as any, new AffixDescriptionService());

    expect(service.getAffixDetails(new Affix({ name: 'Songblade', type: 'Bool', value: 1 }))?.sections[0].parts)
      .toEqual([{ name: 'Perform', value: '+2 Enhancement' }]);
  });

  it('describes fixed affix group components with inherited values', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Lifesealed', ['Negative Energy Absorption', 'Deathblock']);
    affixSvc.affixGroupComponents.set('Lifesealed', [
      { name: 'Negative Energy Absorption', type: '<TypeAlreadyParsed>', value: '<ValueAlreadyParsed>' },
      { name: 'Deathblock', type: 'Bool', value: 1 }
    ]);

    const service = new AffixUiService({} as any, affixSvc, {} as any, new AffixDescriptionService());

    expect(service.getAffixDetails(new Affix({ name: 'Lifesealed', type: 'Enhancement', value: 28 }))?.sections[0].parts).toEqual([
      { name: 'Negative Energy Absorption', value: '+28 Enhancement' },
      { name: 'Deathblock', value: '' },
    ]);
  });

  it('describes regular affix group components with inherited values', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('Purifying Flame Lore', ['Fire Lore', 'Radiance Lore']);

    const service = new AffixUiService({} as any, affixSvc, {} as any, new AffixDescriptionService());

    expect(service.getAffixDetails(new Affix({ name: 'Purifying Flame Lore', type: 'Enhancement', value: 21 }))?.sections[0].parts).toEqual([
      { name: 'Fire Lore', value: '+21 Enhancement' },
      { name: 'Radiance Lore', value: '+21 Enhancement' },
    ]);
  });

  it('shows filigree slots as a count, without the Untyped bonus type', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any, new AffixDescriptionService());
    const filigree = new Affix({ name: 'Max Filigree Slots', type: 'Untyped', value: '3' });

    expect(service.getAffixValueText(filigree)).toBe('3 slots');
    expect(service.getCraftingOptionTooltip({ name: 'Artifact', affixes: [filigree] } as any))
      .toBe('Artifact is:\n- Max Filigree Slots: 3 slots');
    expect(service.getAffixValueText(new Affix({ name: 'Dexterity', type: 'Enhancement', value: 14 })))
      .toBe('+14 Enhancement');
    // An on/off effect is just its name.
    expect(service.getAffixValueText(new Affix({ name: 'True Seeing', type: 'Bool', value: 1 }))).toBe('');
  });

  it('describes crafting option affixes', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any, new AffixDescriptionService());
    const option = { name: 'Flamehorn', affixes: [new Affix({ name: 'Legendary Ash', type: 'Bool', value: 1 })] } as any;

    expect(service.getCraftingOptionTooltip(option))
      .toBe('Flamehorn is:\n- Legendary Ash');
  });

  it('expands crafting option affix groups', () => {
    const affixSvc = new AffixService();
    affixSvc.affixGroups.set('All Skills', ['Balance', 'Spot']);
    const service = new AffixUiService({} as any, affixSvc, {} as any, new AffixDescriptionService());
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
    const service = new AffixUiService(equipped as any, new AffixService(), {} as any, new AffixDescriptionService());
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
    const service = new AffixUiService(equipped as any, new AffixService(), {} as any, new AffixDescriptionService());
    const universalLore = new Affix({ name: 'Universal Spell Lore', type: 'Exceptional', value: 5 });

    expect(service.getClassForAffix(universalLore)).toBe(AffixRank[AffixRank.Best]);
    // Only one part is tracked: the row says how it ranks, as a plain affix's would.
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

  describe('compound affixes with parts ranked differently', () => {
    const universalLore = new Affix({ name: 'Universal Spell Lore', type: 'Exceptional', value: 5 });

    function makeService(ranks: Record<string, AffixRank>) {
      const sources: Record<string, unknown[]> = {
        'Fire Lore': [{ kind: 'item', itemName: 'Flame Ring', slot: 'Ring1' }],
        'Acid Lore': [{ kind: 'set', slot: 'Set', itemName: 'Corroder' }],
      };
      const equipped = {
        getAffixRanking: (affix: Affix) => ranks[affix.name] ?? AffixRank.Irrelevant,
        getSourcesForAffixType: (name: string) => sources[name] ?? [],
      };
      return new AffixUiService(equipped as any, new AffixService(), {} as any, new AffixDescriptionService());
    }

    it('rank as their most useful part, marked partial, when another part is outranked', () => {
      const service = makeService({ 'Force Lore': AffixRank.Best, 'Fire Lore': AffixRank.Outranked });

      expect(service.getClassForAffix(universalLore)).toBe('Best PartialRank');
    });

    it('rank as their most useful part, unmarked, when every relevant part helps', () => {
      const service = makeService({ 'Force Lore': AffixRank.BestTied, 'Fire Lore': AffixRank.BetterThanBest });

      expect(service.getClassForAffix(universalLore)).toBe('BetterThanBest');
    });

    it('are Mixed when a part is a penalty', () => {
      const service = makeService({ 'Force Lore': AffixRank.Best, 'Fire Lore': AffixRank.Penalty });

      expect(service.getClassForAffix(universalLore)).toBe('Mixed');
      expect(service.getAffixTooltip(universalLore)).toBe('Some of its parts help; some are penalties');
    });

    it('rank a tracked group as itself as well as its parts', () => {
      const service = makeService({ 'Universal Spell Lore': AffixRank.Best, 'Fire Lore': AffixRank.Outranked });

      expect(service.getClassForAffix(universalLore)).toBe('Best PartialRank');
      expect(service.getAffixTooltip(universalLore)).toBe('Best equipped value for some of its parts');
    });

    it('describe a tracked group alone as it would any affix', () => {
      const service = makeService({ 'Universal Spell Lore': AffixRank.Best });

      expect(service.getClassForAffix(universalLore)).toBe('Best');
      expect(service.getAffixTooltip(universalLore)).toBe('Best equipped value');
    });

    it('say in one line what every part that sets the rank is tied with or overpowered by', () => {
      const service = makeService({ 'Fire Lore': AffixRank.Outranked, 'Acid Lore': AffixRank.Outranked });

      expect(service.getAffixTooltip(universalLore)).toBe('Overpowered by Corroder set bonus, Flame Ring (Ring1)');
    });

    it('still go part by part in a crafting option\'s tooltip', () => {
      const service = makeService({ 'Force Lore': AffixRank.Best, 'Fire Lore': AffixRank.Outranked });
      const option = new CraftableOption({ name: 'Lore', affixes: [{ name: 'Universal Spell Lore', type: 'Exceptional', value: 5 }] });

      expect(service.getAffixTooltip(universalLore, option).split('\n').sort()).toEqual([
        'Fire Lore: +5 Exceptional: Overpowered by Flame Ring (Ring1)',
        'Force Lore: +5 Exceptional: Best equipped value',
      ]);
    });

    it('carry the partial mark into an option with several affixes', () => {
      const service = makeService({ 'Force Lore': AffixRank.Best, 'Fire Lore': AffixRank.Outranked });
      const option = new CraftableOption({ name: 'Lore', affixes: [
        new Affix({ name: 'Evil Aligned', type: 'Bool', value: 1 }),
        universalLore
      ] });

      expect(service.getClassForCraftingOption(option)).toBe('Best PartialRank');
      // One line for the chosen option's row, as for an affix row: its details list the parts.
      expect(service.getCraftingOptionRankTooltip(option)).toBe('Best equipped value for some of its parts');
    });
  });

  describe('describeExternalAffix', () => {
    const service = new AffixUiService({} as any, {} as any, {} as any, new AffixDescriptionService());
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
      return new AffixUiService(equipped as any, new AffixService(), gearDb as any, new AffixDescriptionService());
    }
    const setAugment = new CraftableOption({ name: 'Set Augment: Quickblade', set: 'Quickblade' });

    it('are ranked by their set bonus, as if the set were complete', () => {
      expect(makeService({ Doublestrike: AffixRank.BetterThanBest }).getClassForCraftingOption(setAugment)).toBe('BetterThanBest');
      expect(makeService({ Doublestrike: AffixRank.Outranked }).getClassForCraftingOption(setAugment)).toBe('Outranked');
    });

    it('are Inactive as a slot\'s chosen option while the set is short, however a list ranks them', () => {
      const service = makeService({ Doublestrike: AffixRank.BetterThanBest });
      const craft = { selected: setAugment } as any;

      expect(service.getClassForCraftable(craft)).toBe('Inactive');
      expect(service.getChosenOptionRankTooltip(setAugment)).toBe('Need 3 set items (currently have 0)');
      // An item not yet equipped counts as a piece of its own.
      expect(service.getChosenOptionRankTooltip(setAugment, undefined, undefined, false)).toBe('Need 3 set items (currently have 1)');
      expect(service.getClassForCraftingOption(setAugment)).toBe('BetterThanBest');
    });

    it('rank as their most useful bonus, marked partial, when another bonus is outranked', () => {
      const service = makeService({ Doublestrike: AffixRank.BetterThanBest, Doubleshot: AffixRank.Outranked });

      expect(service.getClassForCraftingOption(setAugment)).toBe('BetterThanBest PartialRank');
    });

    it('are Mixed only when a bonus is a penalty', () => {
      const service = makeService({ Doublestrike: AffixRank.Best, Doubleshot: AffixRank.Penalty });

      expect(service.getClassForCraftingOption(setAugment)).toBe('Mixed');
    });

    it('are Inactive, not a Penalty, when they carry their own affixes and the set is short', () => {
      const withAffixes = { name: 'Quickblade Rune', set: 'Quickblade', affixes: quickblade } as any;
      const service = makeService({ Doublestrike: AffixRank.Best, Doubleshot: AffixRank.Best });

      expect(service.getClassForCraftingOption(withAffixes)).toBe('Inactive');
      expect(service.getAffixTooltip(quickblade[0], withAffixes)).toBe('Need 3 set items (currently have 0)');
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
      return new AffixUiService(equipped as any, new AffixService(), gearDb as any, new AffixDescriptionService());
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

  describe('an item as a candidate for its slot', () => {
    const service = new AffixUiService({} as any, new AffixService(), {} as any, new AffixDescriptionService());
    const curse = new CraftableOption({ name: 'Curse of Major Strength', affixes: [{ name: 'Strength', type: 'Fortune', value: 2 }] });
    const mythic = new CraftableOption({ name: 'Mythic +3: PRR/MRR', affixes: [{ name: 'Physical Sheltering', type: 'Mythic', value: 3 }] });
    const names = (affixes: Affix[]) => affixes.map(affix => `${affix.name} ${affix.type} ${affix.value}`);

    function cursedHelm() {
      const helm = new Item({ name: 'Helm', slot: 'Helm', ml: 1, affixes: [{ name: 'Wisdom', type: 'Enhancement', value: 5 }] });
      helm.bonuses.curse = curse;
      return helm;
    }

    it('includes the bonuses it carries', () => {
      expect(names(service.candidateFor(cursedHelm()).activeAffixes)).toEqual(['Wisdom Enhancement 5', 'Strength Fortune 2']);
    });

    it('swaps one bonus for another, or for none', () => {
      expect(names(service.candidateFor(cursedHelm(), undefined, undefined, { kind: 'mythic', option: mythic }).activeAffixes))
        .toEqual(['Wisdom Enhancement 5', 'Physical Sheltering Mythic 3', 'Strength Fortune 2']);
      expect(names(service.candidateFor(cursedHelm(), undefined, undefined, { kind: 'curse', option: null }).activeAffixes))
        .toEqual(['Wisdom Enhancement 5']);
    });
  });
});
