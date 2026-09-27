import { formatBuiltAt } from './format-built-at';

describe('formatBuiltAt', () => {
  it('shows a medium date and short time in the viewer\'s locale', () => {
    const value = '2026-09-25T10:20:12+00:00';

    expect(formatBuiltAt(value)).toBe(new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }));
  });

  it('passes a value that isn\'t a date through unchanged', () => {
    expect(formatBuiltAt('not a date')).toBe('not a date');
  });
});
