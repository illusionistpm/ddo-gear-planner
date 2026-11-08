import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, Type } from '@angular/core';
import { Subscription, merge } from 'rxjs';

import { EquippedService } from '../planner/equipped.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { CountedFiligree, FiligreeChoice, FiligreeHost, MAX_WEAPON_FILIGREE_SLOTS } from '../gear/filigree';
import { FILIGREE_TRACKING_MIN_LEVEL } from '../affixes/filigree-affix';
import { GearDbService } from '../gear/gear-db.service';
import { AnalyticsService } from '../shared/analytics.service';
import { describeFiligreeAffixes } from './filigree-text';

export interface FiligreeSlotRow {
  index: number;
  choice: FiligreeChoice | null;
  /** Past the open slots: kept, but not counted. */
  closed: boolean;
  /** A second copy in this host: a set piece whose bonuses don't count. */
  duplicate: boolean;
  affixText: string;
  setText: string;
}

/** Which hosts the player has expanded, kept while the page is open (cards are re-created on a slot change). */
const expandedHosts = new Set<FiligreeHost>();

/**
 * The filigrees slotted in the main-hand weapon or the minor artifact, under that item's card.
 * Collapsed by default to one line with a count, as ten rows would swamp the card. Each slot opens
 * the picker, which is loaded on first use.
 */
@Component({
  selector: 'app-filigree-slots',
  templateUrl: './filigree-slots.component.html',
  styleUrls: ['./filigree-slots.component.css'],
  standalone: false
})
export class FiligreeSlotsComponent implements OnInit, OnDestroy {
  @Input() host: FiligreeHost = 'weapon';

  visible = false;
  expanded = false;
  rows: FiligreeSlotRow[] = [];
  openSlots = 0;
  slotSetting = 0;
  capacity = 0;
  filledCount = 0;

  pickerIndex: number | null = null;
  pickerComponent: Type<unknown> | null = null;

  private subscription?: Subscription;

  constructor(
    private equipped: EquippedService,
    private filigreeDb: FiligreeDbService,
    private gearDb: GearDbService,
    private analytics: AnalyticsService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.expanded = expandedHosts.has(this.host);
    this.subscription = merge(
      this.equipped.getFiligreeLoadoutObservable(),
      this.equipped.getVisibleSetBonusesObservable(),
      this.gearDb.filters.getItemFilters()
    ).subscribe(() => this.refresh());
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  get maxSlotSetting(): number {
    return this.host === 'weapon' ? MAX_WEAPON_FILIGREE_SLOTS : this.capacity;
  }

  get title(): string {
    return this.host === 'weapon' ? 'Sentient weapon filigree' : 'Minor artifact filigree';
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
    if (this.expanded) {
      expandedHosts.add(this.host);
    } else {
      expandedHosts.delete(this.host);
      this.pickerIndex = null;
    }
  }

  changeSlotSetting(step: number) {
    this.equipped.setFiligreeSlotSetting(this.host, this.slotSetting + step);
  }

  async openPicker(index: number) {
    if (this.pickerIndex === index) {
      this.pickerIndex = null;
      return;
    }
    this.pickerIndex = index;
    if (!this.pickerComponent) {
      // The picker's list and logic are only needed once a slot is opened.
      const { FiligreePickerComponent } = await import('../filigree-picker/filigree-picker.component');
      this.pickerComponent = FiligreePickerComponent;
      this.changeDetector.markForCheck();
    }
  }

  closePicker = () => {
    this.pickerIndex = null;
    this.changeDetector.markForCheck();
  };

  pickerInputs(row: FiligreeSlotRow) {
    return {
      host: this.host,
      index: row.index,
      current: row.choice,
      pick: (choice: FiligreeChoice | null) => this.choose(row.index, choice),
      close: this.closePicker,
    };
  }

  choose(index: number, choice: FiligreeChoice | null) {
    this.equipped.setFiligree(this.host, index, choice);
    this.analytics.track('choose_filigree', { host: this.host, cleared: !choice, rare: !!choice?.rare });
    this.pickerIndex = null;
  }

  setRare(row: FiligreeSlotRow, rare: boolean) {
    if (row.choice) {
      this.equipped.setFiligree(this.host, row.index, { ...row.choice, rare });
    }
  }

  clear(row: FiligreeSlotRow) {
    this.choose(row.index, null);
  }

  private refresh() {
    const loadout = this.equipped.getFiligreeLoadout();
    const choices = this.host === 'weapon' ? loadout.weapon : loadout.artifact;
    this.capacity = this.equipped.getFiligreeCapacity(this.host);
    const hasChoices = choices.some(choice => !!choice);
    // Below level 20 there's no filigree to slot; one already slotted still shows.
    const inRange = this.gearDb.getMaxLevelFilter() >= FILIGREE_TRACKING_MIN_LEVEL;
    this.visible = this.capacity > 0 && (inRange || hasChoices);
    this.openSlots = this.equipped.getOpenFiligreeSlots(this.host);
    this.slotSetting = this.equipped.getFiligreeSlotSetting(this.host);

    const counted = new Map<number, CountedFiligree>(this.equipped.getCountedFiligree()
      .filter(entry => entry.host === this.host)
      .map(entry => [entry.index, entry]));
    const lastFilled = choices.reduce((last, choice, index) => choice ? index : last, -1);
    const rowCount = Math.min(choices.length, Math.max(this.openSlots, lastFilled + 1));
    this.rows = choices.slice(0, rowCount).map((choice, index) => {
      const entry = counted.get(index);
      return {
        index,
        choice,
        closed: index >= this.openSlots,
        duplicate: !!entry && !entry.contributes,
        affixText: choice ? describeFiligreeAffixes(this.filigreeDb.getAffixes(choice)) : '',
        setText: choice ? this.filigreeDb.getSets(choice.name).join(' / ') : '',
      };
    });
    this.filledCount = this.rows.filter(row => row.choice && !row.closed).length;
    if (this.pickerIndex !== null && this.pickerIndex >= rowCount) {
      this.pickerIndex = null;
    }
    this.changeDetector.markForCheck();
  }
}
