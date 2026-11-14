import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output
} from '@angular/core';
import { merge, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { AffixUiService, CraftingOptionContext } from '../affixes/affix-ui.service';
import { CRAFTING_PICKER_MIN_OPTIONS } from '../crafting-option-picker/crafting-option-picker.component';
import { AUGMENT_SLOT_1, AUGMENT_SLOT_2, canHaveSecondAugmentSlot } from '../gear/augment-slots';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { craftSystemName } from '../gear/crafting-acquisition';
import { Item } from '../gear/item';
import { ItemFilters } from '../gear/item-filters';
import { isOptionHiddenByPacks } from '../gear/pack-filter';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { perfAggregateStart, perfCount } from '../shared/perf-trace';

interface CraftingOptionDisplayRow {
  option: CraftableOption;
  className?: string;
  tooltip?: string;
  description: string;
}

/** What an empty "pick a system first" slot reads as, or a plain slot's own name. */
export function craftingSystemEmptyLabel(craft: Craftable): string {
  return craft.hasCraftingSystemOptions() ? 'No augment slot' : craft.name;
}

/**
 * One crafting slot's controls: the system to pick first where the slot has a
 * choice of them (else its name), and the option in it - a picker for a long
 * list, a select for a short one, or the choice as text when read-only.
 *
 * It renders two grid cells and no box of its own (display: contents), so it
 * sits in its host's Bootstrap `.row` beside whatever else the row carries.
 *
 * It changes the Craftable in place and emits `changed`; saving the item
 * (equipping it) is the host's call.
 */
@Component({
  selector: 'app-crafting-slot-control',
  templateUrl: './crafting-slot-control.component.html',
  styleUrls: ['./crafting-slot-control.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class CraftingSlotControlComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) item!: Item;
  @Input({ required: true }) craft!: Craftable;
  @Input() readonly = false;
  /** Whether the item is the equipped one, which the picker's notes depend on. */
  @Input() itemIsEquipped = true;
  /**
   * Leave out a plain slot's name where its host already says it (a slot that
   * picks a system first still shows that choice), giving the option the width.
   */
  @Input() hideName = false;
  @Output() readonly changed = new EventEmitter<void>();

  readonly craftingPickerMinOptions = CRAFTING_PICKER_MIN_OPTIONS;
  readonly emptyLabel = craftingSystemEmptyLabel;

  context: CraftingOptionContext | undefined;
  /** The options offered: those within the level filter's maximum, plus the chosen one. */
  visibleOptions: CraftableOption[] = [];
  className = '';
  tooltip = '';
  selectedOptionTooltip = '';
  options: CraftingOptionDisplayRow[] = [];
  private optionsLoaded = false;
  private optionsRanked = false;

  private maxLevel = ItemFilters.MAX_LEVEL();
  private hiddenPacks: ReadonlySet<string> = new Set<string>();
  private optionsWithinMaxLevel = new WeakMap<CraftableOption[], {
    maxLevel: number, hiddenPacks: ReadonlySet<string>, options: CraftableOption[]
  }>();
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly equipped: EquippedService,
    private readonly affixUi: AffixUiService,
    private readonly userGear: UserGearService,
    private readonly changeDetector: ChangeDetectorRef,
    filters: FiltersService
  ) {
    // Subscribed here, not in ngOnInit, so the filters are known before ngOnChanges first builds.
    this.subscriptions.add(filters.getItemFilters().pipe(
      map(itemFilters => ({ maxLevel: itemFilters.levelRange[1], hiddenPacks: itemFilters.hiddenPacks })),
      distinctUntilChanged((a, b) => a.maxLevel === b.maxLevel && a.hiddenPacks === b.hiddenPacks)
    ).subscribe(({ maxLevel, hiddenPacks }) => {
      this.maxLevel = maxLevel;
      this.hiddenPacks = hiddenPacks;
      this.refresh();
    }));
    // What the build tracks and which sets are active both change how the options rank.
    this.subscriptions.add(merge(
      equipped.getImportantAffixesObservable(),
      equipped.getActiveSetBonusesObservable()
    ).subscribe(() => this.refresh()));
  }

  get showsNameCell(): boolean {
    return !this.hideName || this.craft.hasCraftingSystemOptions();
  }

  ngOnChanges(): void {
    this.optionsLoaded = false;
    this.optionsRanked = false;
    this.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Rebuilds what's shown from the item and slot as they are now. */
  refresh(): void {
    if (!this.craft || !this.item) {
      return;
    }
    const done = perfAggregateStart('CraftingSlotControlComponent.refresh');
    const item = this.item;
    const craft = this.craft;
    const candidate = this.affixUi.candidateFor(item);
    this.context = { item, craft };
    this.visibleOptions = this.computeVisibleOptions(craft);
    this.className = this.affixUi.getClassForCraftable(craft, candidate);
    this.tooltip = this.affixUi.getCraftingOptionRankTooltip(craft.selected, item.slot, candidate);
    this.selectedOptionTooltip = this.affixUi.getCraftingOptionTooltip(craft.selected);
    this.options = this.buildOptionRows(this.optionsRanked, this.optionsLoaded);
    this.changeDetector.markForCheck();
    done({ optionRows: this.options.length, rankedOptionRows: this.optionsRanked ? this.options.length : 0 });
  }

  describe(option: CraftableOption): string {
    perfCount('CraftingSlotControlComponent.describe');
    return option ? option.describe() : '';
  }

  /** Where the trove has the augment or upgrade chosen in the slot, if anywhere. */
  getCraftLocations(): UserItemLocation[] | undefined {
    return this.userGear.getCraftingOptionLocations(craftSystemName(this.craft), this.craft.selected);
  }

  chooseOption(option: CraftableOption): void {
    this.craft.selected = option;
    this.emitChanged();
  }

  onSelectChange(): void {
    this.emitChanged();
  }

  updateCraftingSystem(): void {
    this.craft.selectCraftingSystem(this.craft.selectedCraftingSystemName);
    if (this.craft.name === AUGMENT_SLOT_1 && !canHaveSecondAugmentSlot(this.item)) {
      this.item.getCraftingByName(AUGMENT_SLOT_2)?.selectCraftingSystem('');
    }
    this.optionsLoaded = false;
    this.optionsRanked = false;
    this.emitChanged();
  }

  loadAndRankOptions(): void {
    if (this.readonly || (this.optionsLoaded && this.optionsRanked)) {
      return;
    }
    this.optionsLoaded = true;
    this.optionsRanked = true;
    this.options = this.buildOptionRows(true, true);
    this.changeDetector.markForCheck();
  }

  private emitChanged(): void {
    this.changed.emit();
    this.refresh();
  }

  /**
   * The options a character within the filters can use. Only the level maximum excludes one: an
   * option below the minimum still slots in, and some effects only exist at low levels. An option
   * only from hidden packs is left out too. The chosen option stays either way, so the control can
   * still show it.
   */
  private computeVisibleOptions(craft: Craftable): CraftableOption[] {
    const all = craft.options || [];
    const isVisible = (option: CraftableOption) =>
      option.isWithinMaxLevel(this.maxLevel) && !isOptionHiddenByPacks(option, this.hiddenPacks);
    let cached = this.optionsWithinMaxLevel.get(all);
    if (!cached || cached.maxLevel !== this.maxLevel || cached.hiddenPacks !== this.hiddenPacks) {
      const within = all.filter(isVisible);
      // The same array when nothing is left out, so the picker's grouping of it stays cached.
      cached = { maxLevel: this.maxLevel, hiddenPacks: this.hiddenPacks, options: within.length === all.length ? all : within };
      this.optionsWithinMaxLevel.set(all, cached);
    }
    const selected = craft.selected;
    return !selected || isVisible(selected)
      ? cached.options
      : all.filter(option => option === selected || isVisible(option));
  }

  private buildOptionRows(includeRank: boolean, includeAllOptions: boolean): CraftingOptionDisplayRow[] {
    if (this.readonly) {
      return [];
    }
    const done = perfAggregateStart('CraftingSlotControlComponent.buildOptionRows');
    const craft = this.craft;
    const item = this.item;
    const options = includeAllOptions ? this.visibleOptions : [craft.selected];
    const rows = options.map(option => {
      const ranking = includeRank
        ? this.affixUi.rankCraftingOption(option, item.slot, false, { item, craft })
        : null;
      return {
        option,
        className: ranking?.className,
        tooltip: (ranking ? ranking.tooltip : this.affixUi.getCraftingOptionTooltip(option)) || undefined,
        description: option.describe()
      };
    });
    done({ rows: rows.length, rankedRows: includeRank ? rows.length : 0, fullOptionLists: includeAllOptions ? 1 : 0 });
    return rows;
  }
}
