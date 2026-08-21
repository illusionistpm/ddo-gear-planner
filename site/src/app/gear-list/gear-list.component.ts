import { Component, OnInit, ChangeDetectionStrategy, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { GearDbService } from '../gear-db.service';
import { EquippedService, VisibleSetBonus } from '../equipped.service';
import { Affix } from '../affix';
import { AffixUiService } from '../affix-ui.service';
import { Clipboard } from '../clipboard';
import { AnalyticsService } from '../analytics.service';
import { perfAfterFrames, perfStart } from '../perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { PlannerOnboardingService } from '../planner-onboarding.service';

@Component({
    selector: 'app-gear-list',
    templateUrl: './gear-list.component.html',
    styleUrls: ['./gear-list.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GearListComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService,
    private affixUi: AffixUiService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService,
    private onboarding: PlannerOnboardingService
  ) { }

  visibleSetBonuses: Array<VisibleSetBonus> = [];
  onboardingActive = true;
  armorStartHint = false;
  private loggedInitialViewChecked = false;
  private onboardingSubscription?: Subscription;
  private slotSubscriptions: Subscription[] = [];

  ngOnInit() {
    const done = perfStart('GearListComponent.ngOnInit');
    this.equipped.getVisibleSetBonusesObservable().subscribe(setBonuses => {
      this.visibleSetBonuses = setBonuses;
    });
    this.refreshOnboardingState();
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.refreshOnboardingState();
    });
    for (const slot of this.gearList.getSlots()) {
      const slotObservable = this.equipped.getSlot(slot);
      if (slotObservable) {
        this.slotSubscriptions.push(slotObservable.subscribe(() => this.refreshOnboardingState()));
      }
    }
    done({});
  }

  ngOnDestroy() {
    this.onboardingSubscription?.unsubscribe();
    for (const slotSubscription of this.slotSubscriptions) {
      slotSubscription.unsubscribe();
    }
  }

  ngAfterViewInit() {
    const done = perfStart('GearListComponent.ngAfterViewInit');
    done({
      slotCount: this.gearList.getSlots().length,
      activeSetBonusCount: this.visibleSetBonuses.length
    });
    perfAfterFrames('paint after gear list view init');
  }

  ngAfterViewChecked() {
    if (this.loggedInitialViewChecked) {
      return;
    }

    this.loggedInitialViewChecked = true;
    const done = perfStart('GearListComponent.ngAfterViewChecked.first');
    done({
      activeSetBonusCount: this.visibleSetBonuses.length
    });
  }

  showItemsInSet(setName: string) {
    this.analytics.track('open_set_items', {
      source: 'active_set'
    });
    this.suggestionDrawer.openSet(setName);
  }

  getAffixValue(affix: Affix) {
    return this.affixUi.getAffixValue(affix);
  }

  getClassForAffix(affix: Affix) {
    return this.affixUi.getClassForAffix(affix);
  }

  getClassForSetBonusAffix(affix: Affix, eligible: boolean) {
    if (!eligible) {
      return 'DisabledSetBonus';
    }

    return this.getClassForAffix(affix);
  }

  getAffixTooltip(affix: Affix): string {
    return this.affixUi.getAffixTooltip(affix);
  }

  getSetBonusTooltip(eligible: boolean, threshold: number, pieces: number, affix: Affix): string {
    if (!eligible) {
      return `Need ${threshold} set items (currently have ${pieces})`;
    }

    return this.getAffixTooltip(affix);
  }

  copyGearToClipboard() {
    Clipboard.copy(this.equipped.getGearDescription());
    this.analytics.track('copy_build', {
      equipped_slot_count: this.getEquippedSlotCount()
    });
  }

  getAllGear() {
    const allGear = [];
    for (const slot of this.gearList.getSlots()) {
      allGear.push(...this.gearList.getGearBySlot(slot));
    }
    return allGear;
  }

  onGlobalItemSelected = (item: any) => {
    if (item) {
      let actualItem: any = item;
      if (item.original) {
        // This is a synonym match, find the actual item by name
        const allGear = this.getAllGear();
        actualItem = allGear.find(g => g.name === item.original);
        if (!actualItem) {
          console.log('Could not find item with name:', item.original);
          return;
        }
      } else if (!item.slot) {
        // Not an Item object, maybe a fake object
        console.log('Invalid item selected:', item);
        return;
      }
      if (!this.equipped.canEquip(actualItem)) {
        return;
      }
      this.equipped.set(actualItem);
      this.analytics.track('planner_equip_item', {
        equip_source: 'global_search',
        slot: actualItem.slot
      });
    }
  }

  globalResultFormatter = (item: any) => {
    if (item.slot) {
      const current = this.equipped.getSlotsSnapshot().get(item.slot)?.name;
      return item.name + ' (' + item.slot + ')' + (current ? ' (replaces ' + current + ')' : '');
    }
    return item.name;
  }

  private getEquippedSlotCount() {
    return Array.from(this.equipped.getSlotsSnapshot().values()).filter(item => item && item.isValid()).length;
  }

  isBuildEmpty() {
    return this.getEquippedSlotCount() === 0;
  }

  shouldShowArmorStartHint() {
    return this.armorStartHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.refreshOnboardingState();
  }

  private refreshOnboardingState() {
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.armorStartHint = this.onboardingActive && this.isBuildEmpty();
  }
}
