import { ChangeDetectorRef, Component, HostBinding, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { preserveScrollOnMouseDown } from '../shared/preserve-scroll-position';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { ITEM_BONUS_KINDS } from '../gear/item-bonus';
import { ItemBonusService } from '../gear/item-bonus.service';
import { slotLabel } from '../gear/slot-display';
import { QuestService } from '../gear/quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { perfAfterFrames, perfStart } from '../shared/perf-trace';
import { FiligreeHost } from '../gear/filigree';

@Component({
  selector: 'app-equipment-slot-card',
  templateUrl: './equipment-slot-card.component.html',
  styleUrls: ['./equipment-slot-card.component.css'],
  host: {
    class: 'card'
  },
  standalone: false
})
export class EquipmentSlotCardComponent implements OnInit, OnDestroy {
  @Input() slot!: string;
  @Input() recommendedStart = false;

  itemName = '';
  isArtifact = false;
  isRare = false;
  isRaid = false;
  /** The item carries a Mythic Boost, Reaper bonus or Curse. */
  hasBonuses = false;
  /** The Mythic/Reaper/Curse rows are open for editing. */
  editingBonuses = false;
  private slotSubscription?: Subscription;
  private userItemsChangedSubscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    public userGear: UserGearService,
    private analytics: AnalyticsService,
    private questService: QuestService,
    private suggestionDrawer: SuggestionDrawerService,
    private changeDetector: ChangeDetectorRef,
    private itemBonuses: ItemBonusService
  ) { }

  /** Lets the gear list's jump bar find this card. */
  @HostBinding('attr.data-jump-target')
  get dataSlot() {
    return this.slot;
  }

  @HostBinding('class.recommended-start-slot')
  get isRecommendedStart() {
    return this.recommendedStart;
  }

  @HostBinding('class.disabled-slot')
  get disabledSlotClass() {
    return this.equipped.isSlotDisabled(this.slot);
  }

  @HostBinding('attr.title')
  get hostTitle() {
    return this.getSlotTitle();
  }

  ngOnInit() {
    const slot = this.equipped.getSlot(this.slot);
    this.slotSubscription = slot?.subscribe(item => this.setItem(item));
    this.userItemsChangedSubscription = this.userGear.userItemsChanged$.subscribe(() => {
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy() {
    this.slotSubscription?.unsubscribe();
    this.userItemsChangedSubscription?.unsubscribe();
  }

  userOwnsItem(): boolean {
    return !!this.itemName && this.userGear.hasItem(this.itemName);
  }

  getUserItemLocations(): UserItemLocation[] | undefined {
    return this.itemName ? this.userGear.getItemLocations(this.itemName) : undefined;
  }

  showSuggestedItems() {
    if (this.equipped.isSlotDisabled(this.slot)) {
      return;
    }

    const done = perfStart('EquipmentSlotCardComponent.showSuggestedItems');
    this.analytics.track('open_item_suggestions', {
      slot: this.slot
    });
    this.suggestionDrawer.openSlot(this.slot);
    done({ slot: this.slot });
    perfAfterFrames('paint after slot suggestions open');
  }

  clearSlot() {
    if (this.equipped.isSlotDisabled(this.slot)) {
      return;
    }

    this.equipped.clearSlot(this.slot);
    this.analytics.track('planner_clear_slot', {
      slot: this.slot
    });
  }

  readonly preserveScrollOnMouseDown = preserveScrollOnMouseDown;

  /** The filigrees this card's item holds: the main hand is the sentient weapon, and an artifact is an artifact. */
  get filigreeHost(): FiligreeHost | null {
    if (!this.itemName) {
      return null;
    }
    if (this.slot === 'Weapon') {
      return 'weapon';
    }
    return this.isArtifact ? 'artifact' : null;
  }

  /** Every slot but Quiver can carry a Mythic Boost, Reaper bonus or Curse. */
  canTakeBonuses(): boolean {
    return ITEM_BONUS_KINDS.some(kind => this.itemBonuses.getOptions(kind, this.slot).length > 0);
  }

  toggleBonusEditor() {
    this.editingBonuses = !this.editingBonuses;
    if (this.editingBonuses) {
      this.analytics.track('planner_open_item_bonuses', { slot: this.slot });
    }
  }

  get label() {
    return slotLabel(this.slot);
  }

  getSlotTitle() {
    if (this.equipped.isSlotDisabled(this.slot)) {
      return 'Offhand unavailable while a two-handed weapon is equipped.';
    }

    if (this.slot === 'Offhand' && this.equipped.isOffhandRuneArmOnly()) {
      return 'Crossbows can use rune arms in the offhand.';
    }

    return '';
  }

  private setItem(item: Item | null) {
    if (item) {
      this.itemName = item.name;
      this.isArtifact = !!item.artifact;
      this.isRare = !!item.rare;
      this.isRaid = this.questService.isRaidLoot(item);
      this.hasBonuses = ITEM_BONUS_KINDS.some(kind => item.bonuses[kind]);
      return;
    }

    this.itemName = '';
    this.isArtifact = false;
    this.isRare = false;
    this.isRaid = false;
    this.hasBonuses = false;
    this.editingBonuses = false;
  }
}
