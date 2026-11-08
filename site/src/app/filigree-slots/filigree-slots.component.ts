import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit, Type } from '@angular/core';
import { Subscription, merge } from 'rxjs';

import { EquippedService } from '../planner/equipped.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { CountedFiligree, FiligreeChoice, FiligreeHost } from '../gear/filigree';
import { FILIGREE_TRACKING_MIN_LEVEL } from '../affixes/filigree-affix';
import { GearDbService } from '../gear/gear-db.service';
import { AnalyticsService } from '../shared/analytics.service';
import { describeFiligreeAffixes } from './filigree-text';

export interface FiligreeSlotRow {
  index: number;
  /** Null for the empty slot after the last filigree. */
  choice: FiligreeChoice | null;
  /** A second copy in this host: a set piece whose bonuses don't count. */
  duplicate: boolean;
  affixText: string;
  setText: string;
}

/** Which hosts the player has expanded, kept while the page is open (cards are re-created on a slot change). */
const expandedHosts = new Set<FiligreeHost>();

/**
 * The filigrees slotted in the main-hand weapon or the minor artifact, under that item's card.
 * Collapsed by default to one line with a count, as ten rows would swamp the card. Expanded, it
 * lists the filigrees and one empty slot after them while the item has room; removing one slides
 * the rest up. Each slot opens the picker, which is loaded on first use.
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
  capacity = 0;
  filledCount = 0;

  pickerIndex: number | null = null;
  pickerComponent: Type<unknown> | null = null;

  private subscription?: Subscription;
  private cachedPickerInputs?: {
    host: FiligreeHost;
    index: number;
    current: FiligreeChoice | null;
    pick: (choice: FiligreeChoice | null) => void;
    close: () => void;
  };

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

  /**
   * The open picker's inputs, kept until what they say changes: ngComponentOutlet sets inputs again
   * whenever the object differs, and the picker starts over from them each time.
   */
  pickerInputs(row: FiligreeSlotRow) {
    const cached = this.cachedPickerInputs;
    if (cached && cached.index === row.index && cached.current === row.choice) {
      return cached;
    }
    const index = row.index;
    this.cachedPickerInputs = {
      host: this.host,
      index,
      current: row.choice,
      pick: (choice: FiligreeChoice | null) => this.choose(index, choice),
      close: this.closePicker,
    };
    return this.cachedPickerInputs;
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
    const hasChoices = (this.host === 'weapon' ? loadout.weapon : loadout.artifact).length > 0;
    this.capacity = this.equipped.getFiligreeCapacity(this.host);
    // Below level 20 there's no filigree to slot; one already slotted still shows.
    const inRange = this.gearDb.getMaxLevelFilter() >= FILIGREE_TRACKING_MIN_LEVEL;
    this.visible = this.capacity > 0 && (inRange || hasChoices);

    const shown = this.equipped.getShownFiligree(this.host);
    const counted = new Map<number, CountedFiligree>(this.equipped.getCountedFiligree()
      .filter(entry => entry.host === this.host)
      .map(entry => [entry.index, entry]));
    this.rows = shown.map((choice, index) => ({
      index,
      choice,
      duplicate: !counted.get(index)?.contributes,
      affixText: describeFiligreeAffixes(this.filigreeDb.getAffixes(choice)),
      setText: this.filigreeDb.getSets(choice.name).join(' / '),
    }));
    if (this.equipped.getNextFiligreeSlot(this.host) !== null) {
      this.rows.push({ index: shown.length, choice: null, duplicate: false, affixText: '', setText: '' });
    }
    this.filledCount = shown.length;
    if (this.pickerIndex !== null && this.pickerIndex >= this.rows.length) {
      this.pickerIndex = null;
    }
    this.changeDetector.markForCheck();
  }
}
