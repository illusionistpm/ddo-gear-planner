import {
  buildPath, isBuildShortIdRoute, isStillNeededRoute, routePathOf, routeSegmentsOf, stillNeededPath, urlFragmentOf, urlWithoutFragment
} from './build-route';

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

describe('urlFragmentOf', () => {
  it('reads the fragment with its #, as written, after a path or a query string', () => {
    expect(urlFragmentOf('/build/abc123/my-build#shopping-list')).toBe('#shopping-list');
    expect(urlFragmentOf('/?b=z1.test#still-needed:1.a.b')).toBe('#still-needed:1.a.b');
  });

  it('reads no fragment as an empty string', () => {
    expect(urlFragmentOf('/build/abc123/my-build?b=z1.test')).toBe('');
  });
});

describe('urlWithoutFragment', () => {
  it('keeps the path and query string, dropping the fragment', () => {
    expect(urlWithoutFragment('/?b=z1.test#shopping-list')).toBe('/?b=z1.test');
    expect(urlWithoutFragment('/build/abc123/my-build#still-needed')).toBe('/build/abc123/my-build');
    expect(urlWithoutFragment('/build/abc123/my-build')).toBe('/build/abc123/my-build');
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

describe("a friend's still-needed page", () => {
  it("is at /still-needed/:shortId/:slug, beside the build's own /build/:shortId/:slug", () => {
    expect(stillNeededPath('abc123', 'My Build')).toBe('/still-needed/abc123/my-build');
    expect(stillNeededPath('abc123', null)).toBe('/still-needed/abc123');
    expect(buildPath('abc123', 'My Build')).toBe('/build/abc123/my-build');
  });

  it('is recognized with or without its slug, and nothing else is', () => {
    expect(isStillNeededRoute('/still-needed/abc123')).toBe(true);
    expect(isStillNeededRoute('/still-needed/abc123/my-build')).toBe(true);
    for (const path of ['/still-needed', '/still-needed/abc123/my-build/extra', '/build/abc123', '/']) {
      expect(isStillNeededRoute(path)).toBe(false);
    }
  });
});
