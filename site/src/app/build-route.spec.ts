import { isBuildShortIdRoute } from './build-route';

describe('isBuildShortIdRoute', () => {
  it('matches /build/:shortId', () => {
    expect(isBuildShortIdRoute('/build/abc123')).toBeTrue();
  });

  it('matches /build/:shortId/:slug', () => {
    expect(isBuildShortIdRoute('/build/abc123/my-build')).toBeTrue();
  });

  it('does not match /build/:shortId/:slug/extra', () => {
    expect(isBuildShortIdRoute('/build/abc123/my-build/extra')).toBeFalse();
  });

  it('does not match unrelated routes', () => {
    expect(isBuildShortIdRoute('/')).toBeFalse();
    expect(isBuildShortIdRoute('/main')).toBeFalse();
    expect(isBuildShortIdRoute('/affixes')).toBeFalse();
    expect(isBuildShortIdRoute('/build')).toBeFalse();
    expect(isBuildShortIdRoute('/build/')).toBeFalse();
  });
});
