import { AffixDescriptionService } from './affix-description.service';

describe('AffixDescriptionService', () => {
  function serviceWith(descriptions: Record<string, Record<string, string>>) {
    const service = new AffixDescriptionService();
    service.use(descriptions);
    return service;
  }

  it('fills in the affix\'s value and bonus type', () => {
    const service = serviceWith({ Deadly: { '*': 'A +{v} {type} bonus to weapon damage.' } });

    expect(service.describe({ name: 'Deadly', type: 'Insight', value: 5 })).toBe('A +5 Insight bonus to weapon damage.');
  });

  it('says X for a value it doesn\'t have and leaves out a missing type', () => {
    const service = serviceWith({ Deadly: { '*': 'A +{v} {type} bonus to weapon damage.' } });

    expect(service.describe({ name: 'Deadly' })).toBe('A +X bonus to weapon damage.');
  });

  it('keeps a penalty\'s sign in the text rather than doubling it', () => {
    const service = serviceWith({ Spot: { '*': 'A -{v} penalty to Spot.' } });

    expect(service.describe({ name: 'Spot', type: 'Penalty', value: -2 })).toBe('A -2 penalty to Spot.');
  });

  it('uses a type\'s own wording, and the default for any other type', () => {
    const service = serviceWith({ DR: {
      '*': '',
      '-': 'Reduces all physical damage by {v}.',
      Good: 'Reduces physical damage by {v}, except from Good attacks.',
    } });

    expect(service.describe({ name: 'DR', type: 'Good', value: 10 })).toBe('Reduces physical damage by 10, except from Good attacks.');
    expect(service.describe({ name: 'DR', type: '-', value: 5 })).toBe('Reduces all physical damage by 5.');
    expect(service.describe({ name: 'DR', type: 'Evil', value: 5 })).toBe('');
  });

  it('describes nothing before the text has loaded', () => {
    expect(new AffixDescriptionService().describe({ name: 'Deadly', type: 'Insight', value: 5 })).toBe('');
  });

  it('loads the real descriptions as their own chunk', async () => {
    const service = new AffixDescriptionService();
    await service.load();

    expect(service.loaded).toBe(true);
    expect(service.describe({ name: 'Doublestrike', type: 'Enhancement', value: 10 })).toContain('additional hit');
  });
});
