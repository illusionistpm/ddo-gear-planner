import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins, resolveAllowedOrigin } from '../src/cors';

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedOrigins('https://a.com, http://localhost:4200 ,https://b.com'))
      .toEqual(['https://a.com', 'http://localhost:4200', 'https://b.com']);
  });

  it('drops empty entries', () => {
    expect(parseAllowedOrigins('https://a.com,,')).toEqual(['https://a.com']);
  });

  it('handles a single origin with no commas', () => {
    expect(parseAllowedOrigins('https://a.com')).toEqual(['https://a.com']);
  });
});

describe('resolveAllowedOrigin', () => {
  const allowed = ['https://ddo-gear-planner.com', 'http://localhost:4200'];

  it('echoes back the request origin when it is in the allow-list', () => {
    expect(resolveAllowedOrigin('http://localhost:4200', allowed)).toBe('http://localhost:4200');
    expect(resolveAllowedOrigin('https://ddo-gear-planner.com', allowed)).toBe('https://ddo-gear-planner.com');
  });

  it('falls back to the first allowed origin for a disallowed origin', () => {
    expect(resolveAllowedOrigin('https://evil.example.com', allowed)).toBe('https://ddo-gear-planner.com');
  });

  it('falls back to the first allowed origin when there is no Origin header', () => {
    expect(resolveAllowedOrigin(null, allowed)).toBe('https://ddo-gear-planner.com');
  });

  it('returns an empty string when there are no allowed origins at all', () => {
    expect(resolveAllowedOrigin('https://ddo-gear-planner.com', [])).toBe('');
  });
});
