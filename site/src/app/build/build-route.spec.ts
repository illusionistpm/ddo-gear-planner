import { isBuildShortIdRoute, routePathOf, routeSegmentsOf } from './build-route';

describe('routeSegmentsOf and routePathOf', () => {
  it('read the path without its query string or fragment', () => {
    expect(routeSegmentsOf('/build/abc123/my-build?b=z1.test#shopping-list')).toEqual(['build', 'abc123', 'my-build']);
    expect(routeSegmentsOf('/build/abc123/my-build#shopping-list')).toEqual(['build', 'abc123', 'my-build']);
    expect(routePathOf('/build/abc123#still-needed:1.a.b')).toBe('/build/abc123');
  });

  it('read the root as no segments and \'/\'', () => {
    for (const url of ['', '/', '/?b=z1.test', '/#shopping-list', '/?b=z1.test#shopping-list']) {
      expect(routeSegmentsOf(url)).toEqual([]);
      expect(routePathOf(url)).toBe('/');
    }
  });

  it('decode each segment', () => {
    expect(routeSegmentsOf('/build/abc123/my%20build')).toEqual(['build', 'abc123', 'my build']);
  });
});

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
