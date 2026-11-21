import { Injectable, signal } from '@angular/core';
import { Affix } from './affix';

/**
 * data/affix-descriptions.json: affix name to its wiki text, under "*" and under any type whose
 * wording differs ("Shield" for Armor Class, a bypass for DR). '' means the wiki adds nothing the
 * planner doesn't already show. Built by data-builder/affix_descriptions.py, which says how.
 */
export type AffixDescriptions = Record<string, Record<string, string>>;

/** A dynamically imported JSON module's value, whether or not the bundler wraps it in `default`. */
function jsonModuleValue<T>(module: { default?: T }): T {
  return module.default ?? (module as T);
}

/**
 * What affixes do, in DDO Wiki's words. The text (~55KB gzipped) is its own lazy chunk, fetched the
 * first time a view that shows it calls load(), so it costs the initial bundle nothing.
 */
@Injectable({
  providedIn: 'root'
})
export class AffixDescriptionService {
  // A signal, so a template that reads a description re-renders when the text arrives, OnPush or not.
  private readonly descriptions = signal<AffixDescriptions | null>(null);
  private loadPromise?: Promise<void>;

  load(): Promise<void> {
    this.loadPromise ??= import('@data/affix-descriptions.json')
      .then(module => this.use(jsonModuleValue<AffixDescriptions>(module)));
    return this.loadPromise;
  }

  /** Sets the text directly; for specs (see test-setup.ts), which can't wait on load(). */
  use(descriptions: AffixDescriptions) {
    this.descriptions.set(descriptions);
    this.loadPromise ??= Promise.resolve();
  }

  get loaded(): boolean {
    return this.descriptions() !== null;
  }

  /**
   * What the affix does, worded for its type and value where it has them: "+5 Insight bonus to
   * weapon damage." With no value (the affix picker) the number is "X", and with no bonus type the
   * type is left out. '' when the wiki adds nothing, and until load() finishes.
   */
  describe(affix: Pick<Affix, 'name'> & Partial<Pick<Affix, 'type' | 'value'>>): string {
    const entry = this.descriptions()?.[affix.name];
    if (!entry) {
      return '';
    }
    const type = affix.type ?? '';
    const template = (type && type in entry ? entry[type] : entry['*']) ?? '';
    const hasBonusType = !!type && Affix.isRealType(type) && type !== '-';
    const value = affix.value ? String(Math.abs(affix.value)) : 'X';
    return template
      .replace(/\{type\} ?/g, hasBonusType ? type + ' ' : '')
      .replace(/\{v\}/g, value);
  }
}
