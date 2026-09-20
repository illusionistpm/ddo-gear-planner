import { isExternalAffixEntry } from './external-affix';

describe('isExternalAffixEntry', () => {
  const entry = { id: '1', affixName: 'Strength', bonusType: 'Insight', kind: 'value', value: 3, label: 'Spell' };

  it('accepts a well-formed entry', () => {
    expect(isExternalAffixEntry(entry)).toBe(true);
    expect(isExternalAffixEntry({ ...entry, kind: 'ignored' })).toBe(true);
  });

  it('requires an id unless told not to', () => {
    const { id, ...withoutId } = entry;
    expect(id).toBe('1');
    expect(isExternalAffixEntry(withoutId)).toBe(false);
    expect(isExternalAffixEntry(withoutId, false)).toBe(true);
  });

  it('rejects missing or mistyped fields', () => {
    expect(isExternalAffixEntry(null)).toBe(false);
    expect(isExternalAffixEntry('Strength')).toBe(false);
    expect(isExternalAffixEntry({ ...entry, kind: 'other' })).toBe(false);
    expect(isExternalAffixEntry({ ...entry, value: '3' })).toBe(false);
    expect(isExternalAffixEntry({ ...entry, label: undefined })).toBe(false);
    expect(isExternalAffixEntry({ ...entry, affixName: 7 })).toBe(false);
  });
});
