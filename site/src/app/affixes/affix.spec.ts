import { Affix } from './affix';

describe('Affix', () => {
  it('should create an instance', () => {
    expect(new Affix({ name: 'Deadly', type: 'Competence', value: 10 })).toBeTruthy();
  });
});
