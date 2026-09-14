const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_ID_LENGTH = 8;
const DEFAULT_MAX_RETRIES = 5;

export function generateShortId(length = SHORT_ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let id = '';
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

function defaultIsUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

/**
 * Generates a short id and calls `attemptInsert` with it; if that throws a
 * unique-constraint violation, generates a fresh id and retries, up to
 * `maxRetries` times. Regenerate-and-retry rather than checking for
 * existence first, since a pre-check has a race between the check and the
 * insert - letting the database's own unique constraint be the source of
 * truth avoids that race entirely.
 */
export async function withUniqueShortId<T>(
  attemptInsert: (shortId: string) => Promise<T>,
  options?: { maxRetries?: number; isUniqueConstraintError?: (err: unknown) => boolean }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const isCollision = options?.isUniqueConstraintError ?? defaultIsUniqueConstraintError;

  for (let attempt = 0; ; attempt++) {
    const shortId = generateShortId();
    try {
      return await attemptInsert(shortId);
    } catch (err) {
      if (attempt >= maxRetries || !isCollision(err)) {
        throw err;
      }
    }
  }
}
