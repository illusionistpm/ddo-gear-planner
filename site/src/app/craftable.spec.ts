import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

describe('Craftable', () => {
  it('should create an instance', () => {
    expect(new Craftable('Prefix', [new CraftableOption(null)], false)).toBeTruthy();
  });
});
