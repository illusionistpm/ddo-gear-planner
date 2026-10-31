import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';


export interface UserItemLocation {
  character: string;
  location: string;
  tab: string;
  /** Copies in this spot, when the export says (exports without the column don't). */
  quantity?: number;
  /** "BtA" or "BtC" when bound; absent when unbound or not exported. */
  binding?: string;
}

export interface UserGearEntry {
  itemName: string;
  locations: UserItemLocation[];
}

@Injectable({
  providedIn: 'root'
})
export class UserGearService {
  // Map of item name (lowercase) to UserGearEntry
  private userItems: Map<string, UserGearEntry> = new Map();
  private storageKey = 'ddo-user-gear';
  private userItemsChangedSubject = new Subject<void>();
  readonly userItemsChanged$ = this.userItemsChangedSubject.asObservable();

  setUserItems(items: { itemName: string, location: UserItemLocation }[], validNames: Set<string>) {
    this.userItems.clear();
    for (const entry of items) {
      const key = entry.itemName.trim().toLowerCase();
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
   * Returns the number of items loaded.
   */
  importFromTroveCsv(csvText: string, validNames: Set<string>): number {
    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const userItems: { itemName: string, location: UserItemLocation }[] = [];
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

      // Only keep valid equipment
      const key = itemName.trim().toLowerCase();
      if (!validNames.has(key)) continue;
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
    this.setUserItems(userItems, validNames);
    return userItems.length;
  }

  getItemLocations(itemName: string): UserItemLocation[] | undefined {
    return this.userItems.get(itemName.trim().toLowerCase())?.locations;
  }

  hasItem(itemName: string): boolean {
    return this.userItems.has(itemName.trim().toLowerCase());
  }

  clear() {
    this.userItems.clear();
    localStorage.removeItem(this.storageKey);
    this.userItemsChangedSubject.next();
  }

  saveToStorage() {
    const arr = Array.from(this.userItems.values());
    localStorage.setItem(this.storageKey, JSON.stringify(arr));
  }

  loadFromStorage() {
    const data = localStorage.getItem(this.storageKey);
    if (!data) return;
    try {
      const arr: UserGearEntry[] = JSON.parse(data);
      this.userItems.clear();
      for (const entry of arr) {
        this.userItems.set(entry.itemName.trim().toLowerCase(), entry);
      }
    } catch {
      // Corrupt or foreign data in storage: keep the empty collection.
    }
  }
}
