import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, validateBlob, validateName } from '../src/routes/builds';

describe('validateName', () => {
  it('accepts a normal name', () => {
    expect(validateName('My Fighter')).toBe('My Fighter');
  });

  it('trims surrounding whitespace', () => {
    expect(validateName('  My Fighter  ')).toBe('My Fighter');
  });

  it('rejects an empty string', () => {
    expect(validateName('')).toBeNull();
  });

  it('rejects a whitespace-only string', () => {
    expect(validateName('   ')).toBeNull();
  });

  it(`accepts exactly ${MAX_NAME_LENGTH} characters`, () => {
    expect(validateName('x'.repeat(MAX_NAME_LENGTH))).toBe('x'.repeat(MAX_NAME_LENGTH));
  });

  it(`rejects ${MAX_NAME_LENGTH + 1} characters`, () => {
    expect(validateName('x'.repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  });

  it('rejects non-string values', () => {
    expect(validateName(123)).toBeNull();
    expect(validateName(null)).toBeNull();
    expect(validateName(undefined)).toBeNull();
    expect(validateName(['My Fighter'])).toBeNull();
  });
});

describe('validateBlob', () => {
  const MAX_BLOB_LENGTH = 4096;

  it('accepts a normal blob string', () => {
    expect(validateBlob('z1.abc')).toBe('z1.abc');
  });

  it('rejects an empty string', () => {
    expect(validateBlob('')).toBeNull();
  });

  it(`accepts exactly ${MAX_BLOB_LENGTH} characters`, () => {
    const blob = 'x'.repeat(MAX_BLOB_LENGTH);
    expect(validateBlob(blob)).toBe(blob);
  });

  it(`rejects ${MAX_BLOB_LENGTH + 1} characters`, () => {
    expect(validateBlob('x'.repeat(MAX_BLOB_LENGTH + 1))).toBeNull();
  });

  it('rejects non-string values', () => {
    expect(validateBlob(123)).toBeNull();
    expect(validateBlob(null)).toBeNull();
    expect(validateBlob(undefined)).toBeNull();
    expect(validateBlob({})).toBeNull();
  });
});
