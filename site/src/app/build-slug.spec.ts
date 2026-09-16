import { slugifyBuildName } from './build-slug';

describe('slugifyBuildName', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyBuildName('My Awesome Build')).toBe('my-awesome-build');
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugifyBuildName('Café Build')).toBe('cafe-build');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugifyBuildName('Foo!!!Bar   Baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyBuildName('  --Weird Name--  ')).toBe('weird-name');
  });

  it('never emits a path-unsafe character (/, .., ?, #)', () => {
    expect(slugifyBuildName('a/b/../c?d#e')).toBe('a-b-c-d-e');
  });

  it('falls back to "build" when nothing alphanumeric survives', () => {
    expect(slugifyBuildName('★彁🔥')).toBe('build');
    expect(slugifyBuildName('')).toBe('build');
    expect(slugifyBuildName('!!!')).toBe('build');
  });
});
