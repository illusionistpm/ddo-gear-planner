import { Affix } from './affix';
import { AffixRank } from './affix-rank.enum';
import { AffixService } from './affix.service';
import { AffixUiService } from './affix-ui.service';

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

    expect(universalPower.find(affix => affix.name === 'Force Spell Power')).toEqual(jasmine.objectContaining({
      type: 'Artifact',
      value: 15,
    }));
    expect(universalLore.find(affix => affix.name === 'Force Lore')).toEqual(jasmine.objectContaining({
      type: 'Exceptional',
      value: 5,
    }));
  });
});
