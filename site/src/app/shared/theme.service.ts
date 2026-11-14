import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type Theme = 'light' | 'dark';

/** What the viewer chose: a theme, or "whatever my device is using". */
export type ThemeMode = Theme | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService implements OnDestroy {
  private readonly storageKey = 'ddo-gear-planner-theme';
  private readonly darkThemeSubject = new BehaviorSubject<boolean>(false);
  private modeValue: ThemeMode = 'system';
  private readonly systemQuery: MediaQueryList | null =
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  // Follows the device while the mode is 'system': a phone that turns dark at
  // sunset takes the planner with it, without a reload.
  private readonly onSystemChange = () => {
    if (this.modeValue === 'system') {
      this.applyTheme(this.getPreferredTheme());
    }
  };

  readonly darkTheme$ = this.darkThemeSubject.asObservable();

  constructor() {
    const stored = this.getStoredTheme();
    this.modeValue = stored ?? 'system';
    this.applyTheme(stored ?? this.getPreferredTheme());
    this.systemQuery?.addEventListener?.('change', this.onSystemChange);
  }

  ngOnDestroy() {
    this.systemQuery?.removeEventListener?.('change', this.onSystemChange);
  }

  isDarkTheme() {
    return this.darkThemeSubject.value;
  }

  get mode(): ThemeMode {
    return this.modeValue;
  }

  /** 'system' forgets the stored choice, so the device decides from now on. */
  setMode(mode: ThemeMode) {
    this.modeValue = mode;
    if (mode === 'system') {
      this.clearStoredTheme();
      this.applyTheme(this.getPreferredTheme());
    } else {
      this.applyTheme(mode);
      this.storeTheme(mode);
    }
  }

  toggleTheme() {
    this.setMode(this.isDarkTheme() ? 'light' : 'dark');
  }

  private getStoredTheme(): Theme | null {
    try {
      const storedTheme = window.localStorage.getItem(this.storageKey);
      return storedTheme === 'dark' || storedTheme === 'light' ? storedTheme : null;
    } catch {
      return null;
    }
  }

  private getPreferredTheme(): Theme {
    return this.systemQuery?.matches ? 'dark' : 'light';
  }

  private storeTheme(theme: Theme) {
    try {
      window.localStorage.setItem(this.storageKey, theme);
    } catch {
      // Storage can be unavailable in private browsing or tests.
    }
  }

  private clearStoredTheme() {
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch {
      // As above.
    }
  }

  private applyTheme(theme: Theme) {
    const isDarkTheme = theme === 'dark';
    document.documentElement.classList.toggle('dark-theme', isDarkTheme);
    document.documentElement.setAttribute('data-theme', theme);
    this.darkThemeSubject.next(isDarkTheme);
  }
}
