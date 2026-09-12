import { Injectable } from '@angular/core';

/**
 * Loads the large game-data JSON files (items, crafting, essence crafting, sets) via
 * dynamic import so they land in their own lazy chunks instead of being inlined into
 * the initial bundle. Call load() once during app startup (see APP_INITIALIZER in
 * app.module.ts) before anything reads the data fields below.
 */
@Injectable({
  providedIn: 'root'
})
export class GameDataService {
  items!: Array<any>;
  crafting!: Record<string, any>;
  essenceCrafting!: Record<string, any>;
  sets!: Record<string, any>;

  private loadPromise?: Promise<void>;

  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = Promise.all([
        import('src/assets/items.json'),
        import('src/assets/crafting.json'),
        import('src/assets/essence-crafting.json'),
        import('src/assets/sets.json'),
      ]).then(([items, crafting, essenceCrafting, sets]) => {
        this.items = (items as any).default ?? (items as any);
        this.crafting = (crafting as any).default ?? (crafting as any);
        this.essenceCrafting = (essenceCrafting as any).default ?? (essenceCrafting as any);
        this.sets = (sets as any).default ?? (sets as any);
      });
    }
    return this.loadPromise;
  }
}
