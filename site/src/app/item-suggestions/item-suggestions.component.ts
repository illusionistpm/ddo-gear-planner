import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { Observable } from 'rxjs';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { AnalyticsService } from '../analytics.service';
import { perfAfterFrames, perfMeasure, perfStart } from '../perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

@Component({
    selector: 'app-item-suggestions',
    templateUrl: './item-suggestions.component.html',
    styleUrls: ['./item-suggestions.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemSuggestionsComponent implements OnInit {
  @Input() slot!: string;

  current: Observable<Item> | null = null;
  gear: Array<Item> = [];
  filteredGear: Array<Item> = [];
  essenceCrafting: Array<Item> = [];
  searchQuery = '';
  private suggestedGear: Array<Item> = [];

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    public userGear: UserGearService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService
  ) { }

  userOwnsItem(item: Item): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  ngOnInit() {
    const done = perfStart('ItemSuggestionsComponent.ngOnInit');
    this.current = this.equipped.getSlot(this.slot);

    const shortlist: Array<Item> = [];
    this.filteredGear = this.equipped.getCompatibleGearForSlot(this.slot, this.gearDB.getFilteredGearBySlot(this.slot) || []);
    for (const gear of this.filteredGear) {
      shortlist.push(gear);
    }

    const scores = perfMeasure('ItemSuggestionsComponent.scoreItems', () => {
      const scoreMap = new Map<Item, number>();
      for (const item of shortlist) {
        scoreMap.set(item, this.equipped.getScore(item));
      }
      return scoreMap;
    });

    perfMeasure('ItemSuggestionsComponent.sortItems', () => {
      shortlist.sort((a, b) => (scores.get(b) || 0) - (scores.get(a) || 0));
    });

    this.suggestedGear = shortlist.slice(0, 20);
    this.updateDisplayedGear();

    this.essenceCrafting = this.filteredGear.filter(item => item.isGeneratedEssenceCraftingBlank());
    done({
      slot: this.slot,
      filtered: this.filteredGear.length,
      suggested: this.gear.length,
      essenceCrafting: this.essenceCrafting.length
    });
    perfAfterFrames('paint after item suggestions init');
  }

  clearSlot() {
    this.equipped.clearSlot(this.slot);
    this.analytics.track('planner_clear_slot', {
      slot: this.slot,
      clear_source: 'slot_suggestions'
    });
    this.suggestionDrawer.close();
  }

  equipItem(item: Item) {
    this.equipped.set(item);
    this.analytics.track('planner_equip_item', {
      equip_source: 'slot_suggestions',
      slot: item.slot,
      crafted: !!item.isEssenceCrafted()
    });
    this.suggestionDrawer.close();
  }

  onChange(slot: string) {
    return (newVal: any) => {
      if (newVal instanceof Item) {
        this.gear = [newVal];
      } else {
        const found = this.filteredGear.find(item => item.name === newVal);
        if (found) {
          this.gear = [found];
        } else {
          this.gear = [];
        }
      }
    };
  }

  onSearchQueryChanged() {
    this.updateDisplayedGear();
  }

  private updateDisplayedGear() {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      this.gear = this.suggestedGear;
      return;
    }

    this.gear = this.filteredGear
      .filter(item => this.itemMatchesSearch(item, query))
      .sort(this.sortSearchResults(query));
  }

  private itemMatchesSearch(item: Item, query: string) {
    return this.getSearchTerms(item).some(term => term.includes(query));
  }

  private getSearchTerms(item: Item) {
    const terms = [item.name || ''];
    const synonyms = (item as any).synonyms;
    if (synonyms) {
      terms.push(...synonyms);
    }
    return terms.map(term => term.toLowerCase());
  }

  private sortSearchResults(query: string) {
    return (a: Item, b: Item) => {
      const aIndex = this.getSortIndex(query, a);
      const bIndex = this.getSortIndex(query, b);

      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }

      return a.name.localeCompare(b.name);
    };
  }

  private getSortIndex(query: string, item: Item) {
    for (const term of this.getSearchTerms(item)) {
      const words = term.split(' ');
      const wordIndex = words.findIndex(word => word.startsWith(query));
      if (wordIndex >= 0) {
        return wordIndex;
      }
    }

    return 999;
  }

  close() {
    this.suggestionDrawer.close();
  }
}
