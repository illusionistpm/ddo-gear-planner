import { migrateLegacyUrlIfNeeded } from './legacy-url-migration';

describe('migrateLegacyUrlIfNeeded', () => {
  const originalUrl = window.location.pathname + window.location.search + window.location.hash;

  afterEach(() => {
    history.replaceState(null, '', originalUrl);
  });

  it('rewrites a legacy hash route with query params to the equivalent path-based URL', () => {
    window.location.hash = '#/main?levelrange=1,36&Weapon=Calamitous%20Battle%20Axe';

    migrateLegacyUrlIfNeeded();

    expect(window.location.pathname).toBe('/main');
    expect(window.location.search).toBe('?levelrange=1,36&Weapon=Calamitous%20Battle%20Axe');
    expect(window.location.hash).toBe('');
  });

  it('rewrites a legacy hash route with no query params', () => {
    window.location.hash = '#/affixes';

    migrateLegacyUrlIfNeeded();

    expect(window.location.pathname).toBe('/affixes');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('does nothing when there is no hash', () => {
    history.replaceState(null, '', '/main?levelrange=1,36');
    window.location.hash = '';

    migrateLegacyUrlIfNeeded();

    expect(window.location.pathname).toBe('/main');
    expect(window.location.search).toBe('?levelrange=1,36');
  });

  it('does nothing for a hash that is not a legacy route (e.g. an in-page anchor)', () => {
    history.replaceState(null, '', '/main');
    window.location.hash = '#some-anchor';

    migrateLegacyUrlIfNeeded();

    expect(window.location.pathname).toBe('/main');
    expect(window.location.hash).toBe('#some-anchor');
  });
});
