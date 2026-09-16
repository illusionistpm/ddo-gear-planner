// The slug is purely cosmetic (shortId is the only real lookup key - see
// builds.service.ts/routing), but it still ends up in a URL path segment,
// so it must never carry anything but URL-safe characters - no `/`, `..`,
// `?`, `#`, control characters, or non-ASCII. A hand-edited or stale slug
// in a pasted URL is never validated against the stored name; it's just
// ignored on load.
export function slugifyBuildName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents so "Café Build" -> "cafe-build" rather than dropping the letter entirely
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'build';
}
