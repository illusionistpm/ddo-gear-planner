import { isExternalAffixEntry } from './external-affix';

describe('isExternalAffixEntry', () => {
  const entry = { id: '1', affixName: 'Strength', bonusType: 'Insight', kind: 'value', value: 3, label: 'Spell' };

  it('accepts a well-formed entry', () => {
    expect(isExternalAffixEntry(entry)).toBeTrue();
    expect(isExternalAffixEntry({ ...entry, kind: 'ignored' })).toBeTrue();
  });

  it('requires an id unless told not to', () => {
    const { id, ...withoutId } = entry;
    expect(id).toBe('1');
    expect(isExternalAffixEntry(withoutId)).toBeFalse();
    expect(isExternalAffixEntry(withoutId, false)).toBeTrue();
  });

  it('rejects missing or mistyped fields', () => {
    expect(isExternalAffixEntry(null)).toBeFalse();
    expect(isExternalAffixEntry('Strength')).toBeFalse();
    expect(isExternalAffixEntry({ ...entry, kind: 'other' })).toBeFalse();
    expect(isExternalAffixEntry({ ...entry, value: '3' })).toBeFalse();
    expect(isExternalAffixEntry({ ...entry, label: undefined })).toBeFalse();
    expect(isExternalAffixEntry({ ...entry, affixName: 7 })).toBeFalse();
  });
});
