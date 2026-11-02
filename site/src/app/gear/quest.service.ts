import { Injectable } from '@angular/core';

import questList from '@data/quests.json';
import { Item } from './item';
import { getSourcePack } from './pack-filter';

@Injectable({
  providedIn: 'root'
})
export class QuestService {
  private raids = new Set<string>();

  constructor() { 
    const raids = Object.values(questList['raids']);
    for (const raid of raids) {
      this.raids.add(raid);
    }
  }

  isRaid(quest: string) {
    return this.raids.has(quest);
  }

  /**
   * Drops only in raids: what the "Raid" badge marks and "hide raid items" hides. An
   * item that also drops in a normal quest, or is sold by a vendor, can still be had
   * without raiding.
   */
  isRaidLoot(item: Item | null | undefined): boolean {
    return !!item?.quests?.length && item.quests.every(quest => this.isRaid(quest));
  }

  /** The pack a source belongs to, or null when it is free. */
  getPack(source: string): string | null {
    return getSourcePack(source);
  }

  /** Every source of the item, first (the one its card shows) first. */
  getLootSources(item: Item | null | undefined): ReadonlyArray<string> {
    return item?.quests ?? [];
  }

  getLootSourceLabel(item: Item | null | undefined): string {
    if (!item?.quests?.length) {
      return '';
    }

    return item.quests[0];
  }
}
