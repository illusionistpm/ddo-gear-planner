import { UserItemLocationTooltipPipe } from './user-item-location-tooltip.pipe';

describe('UserItemLocationTooltipPipe', () => {
  const pipe = new UserItemLocationTooltipPipe();

  it('lists each location on its own line', () => {
    expect(pipe.transform([
      { character: 'Khalarim', location: 'Inventory', tab: '6' },
      { character: '-', location: 'SharedBank', tab: '' },
    ])).toBe('Khalarim: Inventory (Tab: 6)\n-: SharedBank');
  });

  it('adds a count above one, and marks character-bound copies', () => {
    expect(pipe.transform([
      { character: 'Khalarim', location: 'Inventory', tab: '6', quantity: 3, binding: 'BtC' },
      { character: '-', location: 'SharedBank', tab: 'Main', quantity: 1, binding: 'BtA' },
    ])).toBe('Khalarim: Inventory (Tab: 6) ×3 · BtC\n-: SharedBank (Tab: Main)');
  });

  it('is empty with nowhere to list', () => {
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform([])).toBe('');
  });
});
