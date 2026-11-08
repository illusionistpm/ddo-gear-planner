import {
  FIXED_BUILD_PARAM_KEYS, getMlSlotFromKey, isBuildParamKey, isCraftKey, isItemBonusKey, isMlKey, itemBonusKey, parseCraftKey,
  parseItemBonusKey
} from './build-param-keys';

describe('build-param-keys', () => {
  it('recognizes every fixed key', () => {
    for (const key of FIXED_BUILD_PARAM_KEYS) {
      expect(isBuildParamKey(key, [])).toBe(true);
    }
  });

  it('recognizes ml_ keys', () => {
    expect(isMlKey('ml_Weapon')).toBe(true);
    expect(isMlKey('ml_')).toBe(false);
    expect(isMlKey('Weapon')).toBe(false);

    expect(getMlSlotFromKey('ml_Weapon')).toBe('Weapon');
    expect(getMlSlotFromKey('Weapon')).toBeNull();
  });

  it('recognizes craft_N_field keys', () => {
    expect(isCraftKey('craft_0_slot')).toBe(true);
    expect(isCraftKey('craft_12_system')).toBe(true);
    expect(isCraftKey('craft_3_selected')).toBe(true);
    expect(isCraftKey('craft_3_bogus')).toBe(false);
    expect(isCraftKey('craft_slot')).toBe(false);

    expect(parseCraftKey('craft_3_selected')).toEqual({ index: 3, field: 'selected' });
    expect(parseCraftKey('not_a_craft_key')).toBeNull();
  });

  it('recognizes item bonus keys', () => {
    expect(itemBonusKey('curse', 'Ring1')).toBe('curse_Ring1');
    expect(isItemBonusKey('mythic_Weapon')).toBe(true);
    expect(isItemBonusKey('reaper_Helm')).toBe(true);
    expect(isItemBonusKey('curse_')).toBe(false);
    expect(isItemBonusKey('fortune_Helm')).toBe(false);
    expect(isBuildParamKey('reaper_Helm', [])).toBe(true);

    expect(parseItemBonusKey('curse_Ring1')).toEqual({ kind: 'curse', slot: 'Ring1' });
    expect(parseItemBonusKey('Weapon')).toBeNull();
  });

  it('recognizes data-driven slot names', () => {
    const slots = ['Weapon', 'Offhand', 'Armor'];

    expect(isBuildParamKey('Weapon', slots)).toBe(true);
    expect(isBuildParamKey('Boots', slots)).toBe(false);
  });

  it('rejects keys that are not build data', () => {
    expect(isBuildParamKey('tab', ['Weapon'])).toBe(false);
    expect(isBuildParamKey('taGroup', ['Weapon'])).toBe(false);
    expect(isBuildParamKey('taCollapsed', ['Weapon'])).toBe(false);
    expect(isBuildParamKey('somethingElse', ['Weapon'])).toBe(false);
  });
});
