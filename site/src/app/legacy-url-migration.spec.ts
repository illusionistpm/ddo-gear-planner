import { migrateLegacyUrlIfNeeded } from './legacy-url-migration';

const viewStateKeys = [
  'ddo-gear-planner-active-tab',
  'ddo-gear-planner-tracked-affix-group-mode',
  'ddo-gear-planner-tracked-affix-collapsed'
];

describe('migrateLegacyUrlIfNeeded', () => {
  const originalUrl = window.location.pathname + window.location.search + window.location.hash;

  beforeEach(() => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    history.replaceState(null, '', originalUrl);
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
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

  it('migrates legacy tab/taGroup/taCollapsed query params into localStorage', () => {
    history.replaceState(null, '', '/main?levelrange=1,36&tab=affixes&taGroup=slots&taCollapsed=set-only,2');

    migrateLegacyUrlIfNeeded();

    expect(localStorage.getItem('ddo-gear-planner-active-tab')).toBe('affixes');
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-group-mode')).toBe('slots');
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-collapsed')).toBe('set-only,2');
  });

  it('migrates legacy view-state params carried in a hash-routed link too', () => {
    window.location.hash = '#/affixes?tab=affixes&taGroup=slots';

    migrateLegacyUrlIfNeeded();

    expect(localStorage.getItem('ddo-gear-planner-active-tab')).toBe('affixes');
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-group-mode')).toBe('slots');
  });

  it('does not touch localStorage when no legacy view-state params are present', () => {
    history.replaceState(null, '', '/main?levelrange=1,36');

    migrateLegacyUrlIfNeeded();

    expect(localStorage.getItem('ddo-gear-planner-active-tab')).toBeNull();
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-group-mode')).toBeNull();
    expect(localStorage.getItem('ddo-gear-planner-tracked-affix-collapsed')).toBeNull();
  });
});
