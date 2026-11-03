import { CraftableOption } from './craftable-option';

describe('CraftableOption', () => {
  it('should create an instance', () => {
    expect(new CraftableOption(null)).toBeTruthy();
  });

  it('is within a maximum level at or above its ML, however low its ML is', () => {
    expect(new CraftableOption({ ml: 1 }).isWithinMaxLevel(20)).toBe(true);
    expect(new CraftableOption({ ml: 20 }).isWithinMaxLevel(20)).toBe(true);
    expect(new CraftableOption({ ml: 21 }).isWithinMaxLevel(20)).toBe(false);
    expect(new CraftableOption({}).isWithinMaxLevel(1)).toBe(true);
  });

  it('still matches the pre-rescale description of a Wizardry tier option from a saved build', () => {
    const option = new CraftableOption({ affixes: [{ name: 'Wizardry', type: 'Enhancement', value: '150' }] });

    expect(option.getParamDescription()).toBe('Wizardry150');
    expect(option.matchesParamDescription('Wizardry150')).toBe(true);
    expect(option.matchesParamDescription('Wizardry6')).toBe(true);
    expect(option.matchesParamDescription('Wizardry10')).toBe(false);
  });

  it.each([
    ['Deception1', 'Improved Deception', 'Enhancement', '3'],
    ['Finesse1', 'Finesse', 'Enhancement', '2'],
    ['Underwater Action1', 'Water Breathing', 'Bool', 1],
  ])('still matches the old Bool description %s of an option a saved build chose', (legacy, name, type, value) => {
    const option = new CraftableOption({ affixes: [{ name, type, value }] });

    expect(option.getParamDescription()).toBe(`${name}${value}`);
    expect(option.matchesParamDescription(legacy)).toBe(true);
  });

  it('carries the quests it comes from, sharing the data array', () => {
    const quests = ['One Dame Thing After Another'];
    const option = new CraftableOption({ name: 'Crystallized Unicorn Tear', quests });

    expect(option.quests).toBe(quests);
    expect(new CraftableOption(option).quests).toBe(quests);
  });

  it('has no quests when the data lists none', () => {
    expect(new CraftableOption(null).quests).toEqual([]);
    expect(new CraftableOption({ name: 'Diamond of Balance' }).quests).toEqual([]);
    expect(new CraftableOption({ quests: [] }).quests).toEqual([]);
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
