import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const storageKey = 'ddo-gear-planner-theme';
  let deviceDark = false;
  let listener: (() => void) | null = null;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    localStorage.removeItem(storageKey);
    deviceDark = false;
    listener = null;
    originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      get matches() { return query.includes('dark') && deviceDark; },
      media: query,
      addEventListener: (_: string, fn: () => void) => listener = fn,
      removeEventListener: () => listener = null
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    localStorage.removeItem(storageKey);
    document.documentElement.classList.remove('dark-theme');
  });

  it('follows the device until told otherwise', () => {
    deviceDark = true;
    const theme = TestBed.inject(ThemeService);

    expect(theme.mode).toBe('system');
    expect(theme.isDarkTheme()).toBe(true);
  });

  it('keeps following it when it changes, while on system', () => {
    const theme = TestBed.inject(ThemeService);
    expect(theme.isDarkTheme()).toBe(false);

    deviceDark = true;
    listener?.();

    expect(theme.isDarkTheme()).toBe(true);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
  });

  it('remembers a fixed choice, and stops following the device', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');
    deviceDark = false;
    listener?.();

    expect(theme.isDarkTheme()).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe('dark');
  });

  it('forgets the fixed choice on going back to system', () => {
    localStorage.setItem(storageKey, 'light');
    deviceDark = true;
    const theme = TestBed.inject(ThemeService);
    expect(theme.mode).toBe('light');

    theme.setMode('system');

    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(theme.isDarkTheme()).toBe(true);
  });

  it('toggles to the opposite fixed theme', () => {
    const theme = TestBed.inject(ThemeService);

    theme.toggleTheme();

    expect(theme.mode).toBe('dark');
  });
});
