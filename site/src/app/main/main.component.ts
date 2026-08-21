import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { UserGearService } from '../user-gear.service';
import { GearDbService } from '../gear-db.service';
import { AnalyticsService } from '../analytics.service';
import { FiltersService } from '../filters.service';
import { ItemFilters } from '../item-filters';
import { EquippedService } from '../equipped.service';
import { PlannerOnboardingService } from '../planner-onboarding.service';
import { ThemeService } from '../theme.service';

type MainTab = 'equipment' | 'affixes';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class MainComponent implements OnInit, OnDestroy {
  troveUploadStatus: string = '';
  sortOwnedToTop: boolean = true;
  activeTab: MainTab = 'equipment';
  filtersOpen: boolean = false;
  itemFilters = new ItemFilters();
  onboardingActive = true;
  trackedAffixesHint = false;

  private filterSubscription?: Subscription;
  private onboardingSubscription?: Subscription;
  private slotSubscriptions: Subscription[] = [];

  onSortOwnedToTopChanged(value: boolean) {
    this.sortOwnedToTop = value;
  }

  constructor(
    private userGear: UserGearService,
    private gearDb: GearDbService,
    private analytics: AnalyticsService,
    private filters: FiltersService,
    private equipped: EquippedService,
    private onboarding: PlannerOnboardingService,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    this.userGear.loadFromStorage();
    this.activeTab = this.getInitialTabFromUrl();
    this.filterSubscription = this.filters.getItemFilters().subscribe(itemFilters => {
      this.itemFilters = itemFilters;
    });
    this.refreshOnboardingState();
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.refreshOnboardingState();
    });
    for (const slot of this.gearDb.getSlots()) {
      const slotObservable = this.equipped.getSlot(slot);
      if (slotObservable) {
        this.slotSubscriptions.push(slotObservable.subscribe(() => this.refreshOnboardingState()));
      }
    }
  }

  ngOnDestroy() {
    this.filterSubscription?.unsubscribe();
    this.onboardingSubscription?.unsubscribe();
    for (const slotSubscription of this.slotSubscriptions) {
      slotSubscription.unsubscribe();
    }
  }

  selectTab(tab: MainTab) {
    if (tab === this.activeTab) {
      this.closeFilters();
      return;
    }

    this.activeTab = tab;
    this.closeFilters();
    this.refreshOnboardingState();
  }

  isActiveTab(tab: MainTab) {
    return this.activeTab === tab;
  }

  toggleFilters() {
    this.filtersOpen = !this.filtersOpen;
  }

  toggleTheme() {
    this.theme.toggleTheme();
  }

  closeFilters() {
    this.filtersOpen = false;
  }

  getLevelRangeSummary() {
    return `Level ${this.itemFilters.levelRange[0]}-${this.itemFilters.levelRange[1]}`;
  }

  getContentSummary() {
    const content = [];
    content.push(this.itemFilters.showRaidItems ? 'Raids shown' : 'Raids hidden');
    content.push(this.itemFilters.showRareItems ? 'Rare shown' : 'Rare hidden');
    return content.join(' · ');
  }

  getFilterCountSummary() {
    const hiddenPackCount = this.itemFilters.hiddenPacks.size;
    const hiddenTypeCount = this.itemFilters.hiddenItemTypes.size;
    if (!hiddenPackCount && !hiddenTypeCount) {
      return 'No pack/type filters';
    }

    const parts = [];
    if (hiddenPackCount) {
      parts.push(`${hiddenPackCount} pack${hiddenPackCount === 1 ? '' : 's'} hidden`);
    }
    if (hiddenTypeCount) {
      parts.push(`${hiddenTypeCount} type${hiddenTypeCount === 1 ? '' : 's'} hidden`);
    }
    return parts.join(' · ');
  }

  isBuildEmpty() {
    return Array.from(this.equipped.getSlotsSnapshot().values()).every(item => !item || !item.isValid());
  }

  isArmorEquipped() {
    const armor = this.equipped.getSlotsSnapshot().get('Armor');
    return !!armor && armor.isValid();
  }

  shouldHighlightTrackedAffixes() {
    return this.trackedAffixesHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.refreshOnboardingState();
  }

  onTroveFileSelected(eventOrFile: Event | File) {
    let file: File | null = null;
    if (eventOrFile instanceof File) {
      file = eventOrFile;
    } else {
      const input = eventOrFile.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) {
        this.troveUploadStatus = 'No file selected.';
        return;
      }
      file = input.files[0];
    }
    if (!file) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Parsing...';
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const text = e.target.result;
      const validNames = this.getValidItemNames();
      const count = this.userGear.importFromTroveCsv(text, validNames);
      this.analytics.track('import_trove_csv', {
        imported_item_count_bucket: this.getImportCountBucket(count)
      });
      this.troveUploadStatus = `TroveExport.csv processed! ${count} items loaded.`;
    };
    reader.onerror = () => {
      this.troveUploadStatus = 'Error reading file.';
    };
    reader.readAsText(file);
  }

  private getValidItemNames(): Set<string> {
    const validNames = new Set<string>();
    for (const items of this.gearDb["allGear"].values()) {
      for (const item of items) {
        validNames.add(item.name.trim().toLowerCase());
      }
    }
    return validNames;
  }

  private getImportCountBucket(count: number): string {
    if (count === 0) {
      return '0';
    }
    if (count <= 10) {
      return '1-10';
    }
    if (count <= 50) {
      return '11-50';
    }
    if (count <= 100) {
      return '51-100';
    }
    return '101+';
  }

  private getInitialTabFromUrl(): MainTab {
    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex < 0) {
      return 'equipment';
    }

    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    return params.get('tab') === 'affixes' ? 'affixes' : 'equipment';
  }

  private refreshOnboardingState() {
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.trackedAffixesHint = this.isArmorEquipped() && this.onboardingActive && !this.isActiveTab('affixes');
  }
}
