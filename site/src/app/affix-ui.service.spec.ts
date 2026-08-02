import { Affix } from './affix';
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
});
