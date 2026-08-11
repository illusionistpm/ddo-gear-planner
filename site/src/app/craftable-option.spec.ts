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

  it('matches grouped affix components when affix service is supplied', () => {
    const affixSvc = {
      ungroupAffix: () => [
        {
          name: 'Speed',
          type: 'Enhancement',
          value: 30,
        },
      ],
    } as any;
    const option = new CraftableOption({
      affixes: [
        {
          name: 'Swiftness',
          type: 'Enhancement',
          value: '15',
        },
      ],
    });

    expect(option.getMatchingBonusType('Speed', 'Enhancement', affixSvc)).toBe(30);
  });
});
