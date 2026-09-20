import { isBuildShortIdRoute } from './build-route';

describe('isBuildShortIdRoute', () => {
  it('matches /build/:shortId', () => {
    expect(isBuildShortIdRoute('/build/abc123')).toBe(true);
  });

  it('matches /build/:shortId/:slug', () => {
    expect(isBuildShortIdRoute('/build/abc123/my-build')).toBe(true);
  });

  it('does not match /build/:shortId/:slug/extra', () => {
    expect(isBuildShortIdRoute('/build/abc123/my-build/extra')).toBe(false);
  });

  it('does not match unrelated routes', () => {
    expect(isBuildShortIdRoute('/')).toBe(false);
    expect(isBuildShortIdRoute('/main')).toBe(false);
    expect(isBuildShortIdRoute('/affixes')).toBe(false);
    expect(isBuildShortIdRoute('/build')).toBe(false);
    expect(isBuildShortIdRoute('/build/')).toBe(false);
  });
});
