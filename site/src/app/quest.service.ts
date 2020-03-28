import { Injectable } from '@angular/core';

import questList from 'src/assets/quests.json';

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
}
