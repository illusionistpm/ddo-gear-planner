import { Injectable } from '@angular/core';

import questList from 'src/assets/quests.json';
import { Item } from './item';

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

  isRaidLoot(item: Item | null | undefined): boolean {
    return !!item?.quests?.some(quest => this.isRaid(quest));
  }

  getLootSourceLabel(item: Item | null | undefined): string {
    if (!item?.quests?.length) {
      return '';
    }

    return item.quests[0];
  }
}
