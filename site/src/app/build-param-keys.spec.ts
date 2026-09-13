import {
  FIXED_BUILD_PARAM_KEYS,
  getMlSlotFromKey,
  isBuildParamKey,
  isCraftKey,
  isMlKey,
  parseCraftKey
} from './build-param-keys';

describe('build-param-keys', () => {
  it('recognizes every fixed key', () => {
    for (const key of FIXED_BUILD_PARAM_KEYS) {
      expect(isBuildParamKey(key, [])).toBeTrue();
    }
  });

  it('recognizes ml_ keys', () => {
    expect(isMlKey('ml_Weapon')).toBeTrue();
    expect(isMlKey('ml_')).toBeFalse();
    expect(isMlKey('Weapon')).toBeFalse();

    expect(getMlSlotFromKey('ml_Weapon')).toBe('Weapon');
    expect(getMlSlotFromKey('Weapon')).toBeNull();
  });

  it('recognizes craft_N_field keys', () => {
    expect(isCraftKey('craft_0_slot')).toBeTrue();
    expect(isCraftKey('craft_12_system')).toBeTrue();
    expect(isCraftKey('craft_3_selected')).toBeTrue();
    expect(isCraftKey('craft_3_bogus')).toBeFalse();
    expect(isCraftKey('craft_slot')).toBeFalse();

    expect(parseCraftKey('craft_3_selected')).toEqual({ index: 3, field: 'selected' });
    expect(parseCraftKey('not_a_craft_key')).toBeNull();
  });

  it('recognizes data-driven slot names', () => {
    const slots = ['Weapon', 'Offhand', 'Armor'];

    expect(isBuildParamKey('Weapon', slots)).toBeTrue();
    expect(isBuildParamKey('Boots', slots)).toBeFalse();
  });

  it('rejects keys that are not build data', () => {
    expect(isBuildParamKey('tab', ['Weapon'])).toBeFalse();
    expect(isBuildParamKey('taGroup', ['Weapon'])).toBeFalse();
    expect(isBuildParamKey('taCollapsed', ['Weapon'])).toBeFalse();
    expect(isBuildParamKey('somethingElse', ['Weapon'])).toBeFalse();
  });
});
