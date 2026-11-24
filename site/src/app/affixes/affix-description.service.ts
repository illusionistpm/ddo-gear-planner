import { Injectable, signal } from '@angular/core';
import { Affix } from './affix';

/**
 * data/affix-descriptions.json's "texts": affix name to its wiki text, under "*" and under any type
 * whose wording differs ("Shield" for Armor Class, a bypass for DR). '' means the wiki adds nothing
 * the planner doesn't already show. Built by data-builder/affix_descriptions.py, which says how.
 */
export type AffixDescriptions = Record<string, Record<string, string>>;

/**
 * Its "numbers": for an affix and the key its text is under, each value's numbers for the text's
 * {0}, {1}... slots, space-separated - under "value@ml" where they depend on the item's ML too.
 */
export type AffixDescriptionNumbers = Record<string, Record<string, Record<string, string>>>;

interface AffixDescriptionFile {
  texts: AffixDescriptions;
  numbers: AffixDescriptionNumbers;
}

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
  private readonly descriptions = signal<AffixDescriptionFile | null>(null);
  private loadPromise?: Promise<void>;

  load(): Promise<void> {
    this.loadPromise ??= import('@data/affix-descriptions.json')
      .then(module => {
        const file = jsonModuleValue<AffixDescriptionFile>(module);
        this.use(file.texts, file.numbers);
      });
    return this.loadPromise;
  }

  /** Sets the text directly; for specs (see test-setup.ts), which can't wait on load(). */
  use(texts: AffixDescriptions, numbers: AffixDescriptionNumbers = {}) {
    this.descriptions.set({ texts, numbers });
    this.loadPromise ??= Promise.resolve();
  }

  get loaded(): boolean {
    return this.descriptions() !== null;
  }

  /**
   * What the affix does, worded for its type and value where it has them: "+5 Insight bonus to
   * weapon damage." With no value (the affix picker) its number is "X", as is any other number the
   * value - and the item's ML, when given - doesn't decide; with no bonus type the type is left out.
   * '' when the wiki adds nothing, and until load() finishes.
   */
  describe(affix: Pick<Affix, 'name'> & Partial<Pick<Affix, 'type' | 'value'>>, ml?: number): string {
    const file = this.descriptions();
    const entry = file?.texts[affix.name];
    if (!entry) {
      return '';
    }
    const type = affix.type ?? '';
    const key = type && type in entry ? type : '*';
    const template = entry[key] ?? '';
    const hasBonusType = !!type && Affix.isRealType(type) && type !== '-';
    const value = affix.value ? String(Math.abs(affix.value)) : 'X';
    const table = affix.value ? file.numbers[affix.name]?.[key] : undefined;
    const slots = (table?.[`${affix.value}@${ml}`] ?? table?.[String(affix.value)])?.split(' ') ?? [];
    return template
      .replace(/\{type\} ?/g, hasBonusType ? type + ' ' : '')
      .replace(/\{v\}/g, value)
      .replace(/\{(\d+)\}/g, (_, index: string) => slots[Number(index)] ?? 'X');
  }
}
