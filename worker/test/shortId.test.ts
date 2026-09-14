import { describe, expect, it, vi } from 'vitest';
import { generateShortId, withUniqueShortId } from '../src/shortId';

describe('generateShortId', () => {
  it('generates an 8-character URL-safe id', () => {
    const id = generateShortId();
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
  });

  it('generates different ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateShortId()));
    expect(ids.size).toBe(20);
  });
});

describe('withUniqueShortId', () => {
  it('returns the result on the first successful attempt', async () => {
    const attemptInsert = vi.fn().mockResolvedValue('ok');

    const result = await withUniqueShortId(attemptInsert);

    expect(result).toBe('ok');
    expect(attemptInsert).toHaveBeenCalledTimes(1);
  });

  it('regenerates and retries on a unique-constraint collision', async () => {
    const attemptInsert = vi.fn()
      .mockRejectedValueOnce(new Error('D1_ERROR: UNIQUE constraint failed: builds.short_id'))
      .mockRejectedValueOnce(new Error('D1_ERROR: UNIQUE constraint failed: builds.short_id'))
      .mockResolvedValueOnce('ok on third try');

    const result = await withUniqueShortId(attemptInsert);

    expect(result).toBe('ok on third try');
    expect(attemptInsert).toHaveBeenCalledTimes(3);
    // Each retry must use a freshly generated id, not repeat the same one.
    const idsTried = attemptInsert.mock.calls.map(call => call[0]);
    expect(new Set(idsTried).size).toBe(3);
  });

  it('gives up after maxRetries collisions and surfaces the error', async () => {
    const collisionError = new Error('UNIQUE constraint failed: builds.short_id');
    const attemptInsert = vi.fn().mockRejectedValue(collisionError);

    await expect(withUniqueShortId(attemptInsert, { maxRetries: 2 })).rejects.toBe(collisionError);
    expect(attemptInsert).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('does not retry on a non-collision error', async () => {
    const otherError = new Error('D1_ERROR: some unrelated failure');
    const attemptInsert = vi.fn().mockRejectedValue(otherError);

    await expect(withUniqueShortId(attemptInsert)).rejects.toBe(otherError);
    expect(attemptInsert).toHaveBeenCalledTimes(1);
  });

  it('uses a custom isUniqueConstraintError predicate when provided', async () => {
    const customError = new Error('SHORT_ID_TAKEN');
    const attemptInsert = vi.fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce('ok');

    const result = await withUniqueShortId(attemptInsert, {
      isUniqueConstraintError: err => err instanceof Error && err.message === 'SHORT_ID_TAKEN'
    });

    expect(result).toBe('ok');
    expect(attemptInsert).toHaveBeenCalledTimes(2);
  });
});
