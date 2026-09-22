import { Component, OnInit, ChangeDetectionStrategy, AfterViewInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService, VisibleSetBonus } from '../planner/equipped.service';
import { Affix } from '../affixes/affix';
import { AffixUiService } from '../affixes/affix-ui.service';
import { AnalyticsService } from '../shared/analytics.service';
import { perfAfterFrames, perfStart } from '../shared/perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';

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
    public affixUi: AffixUiService,
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

  getSetBonusTooltip(eligible: boolean, threshold: number, pieces: number, affix: Affix): string {
    return eligible ? this.affixUi.getAffixTooltip(affix) : this.affixUi.getSetBonusLockedTooltip(threshold, pieces);
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
    this.armorStartHint = this.onboardingActive && this.equipped.isBuildEmpty();
  }
}
