import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly storageKey = 'ddo-gear-planner-theme';
  private readonly darkThemeSubject = new BehaviorSubject<boolean>(false);

  readonly darkTheme$ = this.darkThemeSubject.asObservable();

  constructor() {
    const initialTheme = this.getStoredTheme() || this.getPreferredTheme();
    this.applyTheme(initialTheme);
  }

  isDarkTheme() {
    return this.darkThemeSubject.value;
  }

  toggleTheme() {
    const nextTheme: Theme = this.isDarkTheme() ? 'light' : 'dark';
    this.applyTheme(nextTheme);
    this.storeTheme(nextTheme);
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
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private storeTheme(theme: Theme) {
    try {
      window.localStorage.setItem(this.storageKey, theme);
    } catch {
      // Storage can be unavailable in private browsing or tests.
    }
  }

  private applyTheme(theme: Theme) {
    const isDarkTheme = theme === 'dark';
    document.documentElement.classList.toggle('dark-theme', isDarkTheme);
    document.documentElement.setAttribute('data-theme', theme);
    this.darkThemeSubject.next(isDarkTheme);
  }
}
