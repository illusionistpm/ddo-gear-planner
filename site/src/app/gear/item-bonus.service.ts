import { Injectable } from '@angular/core';

import { GameDataService } from './game-data.service';
import { CraftableOption } from './craftable-option';
import { ItemBonusKind } from './item-bonus';
import { RawItemBonusOption } from './game-data-types';

/** Slots that can't carry a Mythic Boost, Reaper bonus or Curse. */
const SLOTS_WITHOUT_BONUSES: ReadonlySet<string> = new Set(['Quiver']);

/** The data's slot for an equipment slot: both ring slots take ring bonuses. */
function dataSlotFor(slot: string): string {
  return /^Ring\d$/.test(slot) ? 'Ring' : slot;
}

/** The Mythic Boosts, Reaper bonuses and Curses each equipment slot can carry. */
@Injectable({
  providedIn: 'root'
})
export class ItemBonusService {
  /** What a bonus dropdown lists first, as a crafting slot lists its empty option. Never stored on an item. */
  readonly none = new CraftableOption(null, 'None');

  private index?: Map<ItemBonusKind, Map<string, readonly CraftableOption[]>>;
  private curses?: readonly CraftableOption[];

  constructor(private gameData: GameDataService) {}

  /** The options of one kind an item in `slot` can carry, in data order; none for a slot that can't take bonuses. */
  getOptions(kind: ItemBonusKind, slot: string): readonly CraftableOption[] {
    if (SLOTS_WITHOUT_BONUSES.has(slot)) {
      return [];
    }
    if (kind === 'curse') {
      return this.getCurses();
    }
    return this.getIndex().get(kind)?.get(dataSlotFor(slot)) ?? [];
  }

  /** The option called `name`, if an item in `slot` can carry it. */
  find(kind: ItemBonusKind, slot: string, name: string): CraftableOption | undefined {
    return name ? this.getOptions(kind, slot).find(option => option.name === name) : undefined;
  }

  // Built on first use: game data is loaded by then, but not when services are constructed.
  private getIndex() {
    if (!this.index) {
      const data = this.gameData.itemBonuses;
      this.index = new Map([
        ['mythic', this.buildSlotIndex(data.mythic)],
        ['reaper', this.buildSlotIndex(data.reaper)],
      ]);
    }
    return this.index;
  }

  private getCurses() {
    this.curses ??= this.gameData.itemBonuses.curses.map(raw => new CraftableOption(raw));
    return this.curses;
  }

  private buildSlotIndex(bySlot: Record<string, RawItemBonusOption[]>): Map<string, readonly CraftableOption[]> {
    return new Map(Object.entries(bySlot).map(([slot, options]) => [slot, options.map(raw => new CraftableOption(raw))]));
  }
}
