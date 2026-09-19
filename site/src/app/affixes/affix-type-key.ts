/**
 * The one way to key a Map/Set by an (affixName, bonusType) pair.
 *
 * NUL is the separator because it cannot appear in either name, so distinct
 * pairs can never collide. Every index and cache keyed on this pair must build
 * its keys here — a hand-rolled key with a different separator would silently
 * miss.
 */
export function affixTypeKey(affixName: string, bonusType: string): string {
  return affixName + '\0' + bonusType;
}
