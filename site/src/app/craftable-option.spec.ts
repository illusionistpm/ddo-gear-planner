import { CraftableOption } from './craftable-option';

describe('CraftableOption', () => {
  it('should create an instance', () => {
    expect(new CraftableOption(null)).toBeTruthy();
  });

  it('describes compound affix options', () => {
    const option = new CraftableOption({
      affixes: [
        {
          name: 'Dexterity Skills',
          type: 'Competence',
          value: '22',
        },
        {
          name: 'False Life',
          type: 'Profane',
          value: '28',
        },
      ],
    });

    expect(option.describe()).toBe('Dexterity Skills +22 Competence, False Life +28 Profane');
  });
});
