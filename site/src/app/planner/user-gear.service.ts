import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import { CraftableOption } from '../gear/craftable-option';
import { classifyCraftSelection } from '../gear/crafting-acquisition';


export interface UserItemLocation {
  character: string;
  location: string;
  tab: string;
  /** Copies in this spot, when the export says (exports without the column don't). */
  quantity?: number;
  /** "BtA" or "BtC" when bound; absent when unbound or not exported. */
  binding?: string;
}

/** Rows of each kind an import kept. */
export interface TroveImportCounts {
  items: number;
  augments: number;
}

/**
 * How names are matched: case- and spacing-insensitively, as the export
 * sometimes doubles a space ("Spines of the Manticore:  Reflex").
 */
export function troveNameKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface UserGearEntry {
  itemName: string;
  locations: UserItemLocation[];
}

@Injectable({
  providedIn: 'root'
})
export class UserGearService {
  // Map of troveNameKey(name) to UserGearEntry - items, and augments and other
  // crafting pieces that are things in their own right.
  private userItems: Map<string, UserGearEntry> = new Map();
  private storageKey = 'ddo-user-gear';
  private userItemsChangedSubject = new Subject<void>();
  readonly userItemsChanged$ = this.userItemsChangedSubject.asObservable();

  setUserItems(items: { itemName: string, location: UserItemLocation }[], validNames: Set<string>) {
    this.userItems.clear();
    for (const entry of items) {
      const key = troveNameKey(entry.itemName);
      if (!validNames.has(key)) continue;
      if (!this.userItems.has(key)) {
        this.userItems.set(key, { itemName: entry.itemName, locations: [] });
      }
      this.userItems.get(key)!.locations.push(entry.location);
    }
    this.saveToStorage();
    this.userItemsChangedSubject.next();
  }

  /**
   * Import user gear from a TroveExport.csv file.
   * Parses, normalizes, deduplicates, aggregates, and persists user gear.
   * Keeps rows naming one of `itemNames` or `craftingOptionNames` (both as
   * troveNameKey gives them) and returns how many of each it kept.
   */
  importFromTroveCsv(csvText: string, itemNames: ReadonlySet<string>,
      craftingOptionNames: ReadonlySet<string> = new Set()): TroveImportCounts {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const userItems: { itemName: string, location: UserItemLocation }[] = [];
    const counts: TroveImportCounts = { items: 0, augments: 0 };
    let quantityIndex = -1;
    let bindingIndex = -1;

    for (const line of lines) {
      // Parse CSV line (handles quoted fields)
      const match = line.match(/(?:"([^"]*)"|([^,]*))(,|$)/g);
      if (!match || match.length < 5) continue;
      const fields = match.map(f => f.replace(/^,|,$|"/g, '').trim());
      if (fields.length < 5) continue;
      if (fields[0] === 'SubscriptionHash') {
        // Newer exports add Quantity and Binding columns, named in the header.
        quantityIndex = fields.indexOf('Quantity');
        bindingIndex = fields.indexOf('Binding');
        continue;
      }
      let itemName = fields[4];

      // Normalize '+6Drow' or similar to 'Drow'
      itemName = itemName.replace(/^\+\d+Drow/, 'Drow');

      // Only keep equipment, augments and the like
      const key = troveNameKey(itemName);
      const isItem = itemNames.has(key);
      if (!isItem && !craftingOptionNames.has(key)) continue;
      counts[isItem ? 'items' : 'augments']++;
      const location: UserItemLocation = {
        character: fields[1],
        location: fields[2],
        tab: fields[3]
      };
      const quantity = quantityIndex >= 0 ? Number.parseInt(fields[quantityIndex], 10) : NaN;
      if (quantity > 0) {
        location.quantity = quantity;
      }
      const binding = bindingIndex >= 0 ? fields[bindingIndex] : '';
      if (binding && binding !== 'None') {
        location.binding = binding;
      }
      userItems.push({ itemName, location });
    }
    this.setUserItems(userItems, new Set([...itemNames, ...craftingOptionNames]));
    return counts;
  }

  getItemLocations(itemName: string): UserItemLocation[] | undefined {
    return this.userItems.get(troveNameKey(itemName))?.locations;
  }

  /**
   * Where the trove has a crafting option chosen in `system`, when it is a thing
   * in its own right (an augment or named upgrade) rather than crafting done to
   * an item - whose name could otherwise match something else.
   */
  getCraftingOptionLocations(system: string, option: CraftableOption | null | undefined): UserItemLocation[] | undefined {
    const kind = classifyCraftSelection(system, option);
    return option?.name && (kind === 'augment' || kind === 'upgrade') ? this.getItemLocations(option.name) : undefined;
  }

  hasItem(itemName: string): boolean {
    return this.userItems.has(troveNameKey(itemName));
  }

  clear() {
    this.userItems.clear();
    localStorage.removeItem(this.storageKey);
    this.userItemsChangedSubject.next();
  }

  saveToStorage() {
    const arr = Array.from(this.userItems.values());
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(arr));
    } catch {
      // Storage full or unavailable: keep what was imported for this visit.
    }
  }

  loadFromStorage() {
    const data = localStorage.getItem(this.storageKey);
    if (!data) return;
    try {
      const arr: UserGearEntry[] = JSON.parse(data);
      this.userItems.clear();
      for (const entry of arr) {
        this.userItems.set(troveNameKey(entry.itemName), entry);
      }
    } catch {
      // Corrupt or foreign data in storage: keep the empty collection.
    }
  }
}
