import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { UserGearService } from '../user-gear.service';

import { FiltersService } from '../filters.service';
import { AnalyticsService } from '../analytics.service';

import { Output, EventEmitter } from '@angular/core';
import buildInfo from 'src/assets/build-info.json';
import itemsList from 'src/assets/items.json';

@Component({
    selector: 'app-filters',
    templateUrl: './filters.component.html',
    styleUrls: ['./filters.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class FiltersComponent implements OnInit {
  readonly freeQuestsPackLabel = 'Free Quests';
  minLevel: number = 1;
  maxLevel: number = 30;
  showRaidItems: boolean = false;
  showRareItems: boolean = true;
  showPackFilters: boolean = false;
  packOptions: Array<{name: string, value: boolean}> = [];
  readonly dataBuiltAt: string = this.formatBuiltAt(buildInfo.builtAt);

  sortOwnedToTop: boolean = true;

  @Output() troveFileSelected = new EventEmitter<File>();
  @Output() sortOwnedToTopChanged = new EventEmitter<boolean>();
  troveUploadStatus: string = '';
  userGearCount: number = 0;

  constructor(
    public filters: FiltersService,
    private userGear: UserGearService,
    private analytics: AnalyticsService
  ) {
    this.packOptions = this.getAllPackOptions();
    filters.getItemFilters().subscribe(itemFilters => {
      this.minLevel = itemFilters.levelRange[0];
      this.maxLevel = itemFilters.levelRange[1];
      this.showRaidItems = itemFilters.showRaidItems;
      this.showRareItems = itemFilters.showRareItems;
      this.packOptions.forEach(option => option.value = !itemFilters.hiddenPacks.has(this.packFilterValue(option.name)));
    });
    this.updateUserGearCount();
  }
  ngOnInit() {
    this.updateUserGearCount();
  }
  updateUserGearCount() {
    try {
      const data = localStorage.getItem('ddo-user-gear');
      if (data) {
        const arr = JSON.parse(data);
        this.userGearCount = Array.isArray(arr) ? arr.length : 0;
      } else {
        this.userGearCount = 0;
      }
    } catch {
      this.userGearCount = 0;
    }
  }

  onClearUserGear() {
    this.userGear.clear();
    this.updateUserGearCount();
  }


  onChangeLevelRange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
    this.analytics.track('change_level_range', {
      min_level: this.minLevel,
      max_level: this.maxLevel,
      level_span: this.maxLevel - this.minLevel + 1
    });
  }
  
  onChangeShowRaidItems() {
    this.filters.setShowRaidItems(this.showRaidItems);
    this.analytics.track('toggle_raid_items', {
      enabled: this.showRaidItems
    });
  }

  onChangeShowRareItems() {
    this.filters.setShowRareItems(this.showRareItems);
    this.analytics.track('toggle_rare_items', {
      enabled: this.showRareItems
    });
  }

  onChangePacks(items: Array<{name: string, value: boolean}>, changeSource: string): void {
    const hiddenPacks = new Set<string>();
    items.filter(item => !item.value)
      .forEach(item => hiddenPacks.add(this.packFilterValue(item.name)));

    this.filters.setHiddenPacks(hiddenPacks);
    this.analytics.track('change_pack_filters', {
      interaction_level: changeSource,
      hidden_pack_count: hiddenPacks.size
    });
  }

  togglePackFilters() {
    this.showPackFilters = !this.showPackFilters;
  }

  areAllPacksChecked() {
    return this.packOptions.every(option => option.value);
  }

  areSomePacksChecked() {
    return this.packOptions.some(option => option.value);
  }

  toggleAllPacks() {
    const checked = !this.areAllPacksChecked();
    this.packOptions.forEach(option => option.value = checked);
    this.onChangePacks(this.packOptions, 'top_level');
  }

  onChangePackOption() {
    this.onChangePacks(this.packOptions, 'subgroup');
  }

  onTroveFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    const file = input.files[0];
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Processing...';
    this.troveFileSelected.emit(file);
    // Update the userGearCount after the parent processes the file (with a small delay to ensure storage is updated)
    setTimeout(() => this.updateUserGearCount(), 100);
  }

  onSortOwnedToTopChanged() {
    this.sortOwnedToTopChanged.emit(this.sortOwnedToTop);
  }

  private formatBuiltAt(value: string): string {
    const builtAt = new Date(value);
    if (Number.isNaN(builtAt.getTime())) {
      return value;
    }

    return builtAt.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  private getAllPackOptions(): Array<{name: string, value: boolean}> {
    const packs = new Set<string>();
    let hasNoPack = false;

    for (const item of itemsList as Array<any>) {
      if (item.pack) {
        packs.add(item.pack);
      } else {
        hasNoPack = true;
      }
    }

    const options = Array.from(packs)
      .sort((left, right) => left.localeCompare(right))
      .map(pack => ({name: pack, value: true}));

    if (hasNoPack) {
      options.unshift({name: this.freeQuestsPackLabel, value: true});
    }

    return options;
  }

  private packFilterValue(packName: string): string {
    return packName === this.freeQuestsPackLabel ? FiltersService.NO_PACK_FILTER : packName;
  }
}
