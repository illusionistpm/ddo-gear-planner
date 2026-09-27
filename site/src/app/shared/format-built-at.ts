/**
 * When the game data was built, for display: a medium date and short time in the
 * viewer's locale. Anything that doesn't parse as a date is shown as-is.
 */
export function formatBuiltAt(value: string): string {
  const builtAt = new Date(value);
  if (Number.isNaN(builtAt.getTime())) {
    return value;
  }

  return builtAt.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
