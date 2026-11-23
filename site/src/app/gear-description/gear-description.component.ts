import { ChangeDetectorRef, Component, OnDestroy, OnInit, Input, ChangeDetectionStrategy, OnChanges, QueryList, SimpleChanges, ViewChildren } from '@angular/core';

import { EquippedService } from '../planner/equipped.service';
import { EssenceCraftingService } from '../gear/essence-crafting.service';
import { AffixService } from '../affixes/affix.service';
import { AffixDetails, AffixUiService, CraftingOptionContext } from '../affixes/affix-ui.service';
import { AffixDescriptionService } from '../affixes/affix-description.service';
import { Affix } from '../affixes/affix';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { Item } from '../gear/item';
import { Observable, Subscription } from 'rxjs';
import { skip } from 'rxjs/operators';

import { perfAfterFrames, perfAggregateStart, perfStart } from '../shared/perf-trace';
import { QuestService } from '../gear/quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { isCraftingSlotAvailable, normalizeAugmentSlots } from '../gear/augment-slots';
import { CRAFTING_PICKER_MIN_OPTIONS } from '../crafting-option-picker/crafting-option-picker.component';
import { CraftingSlotControlComponent } from '../crafting-slot-control/crafting-slot-control.component';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusService } from '../gear/item-bonus.service';
import { ITEM_BONUS_KIND_LABELS, ItemBonusSettingsService } from '../planner/item-bonus-settings.service';

interface AffixDisplayRow {
  affix: Affix;
  className: string;
  tooltip: string;
  important: boolean;
  /** What the affix does and, for a compound, what it counts toward; null leaves the name plain. */
  details: AffixDetails | null;
  valueText: string;
  /** Set when a chosen upgrade replaced the item's own affix with this one: what it was, and by what. */
  upgradeNote: string;
}

/** A crafting slot's row; its controls are a CraftingSlotControlComponent's. */
interface CraftingDisplayRow {
  craft: Craftable;
  important: boolean;
}

/** A Mythic Boost, Reaper bonus or Curse row: shown for a system the player has switched on, or a bonus the item carries anyway. */
interface ItemBonusDisplayRow {
  kind: ItemBonusKind;
  label: string;
  /** The item's bonus of this kind, or ItemBonusService.none. */
  selected: CraftableOption;
  context: CraftingOptionContext;
  /** None, then what the slot can carry; empty when the row can't be edited (a read-only description). */
  visibleOptions: CraftableOption[];
  className: string;
  tooltip: string;
  important: boolean;
  selectedOptionTooltip: string;
}

interface SetDisplayRow {
  name: string;
  count: number | undefined;
}

@Component({
    selector: 'app-gear-description',
    templateUrl: './gear-description.component.html',
    styleUrls: ['./gear-description.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class GearDescriptionComponent implements OnInit, OnDestroy, OnChanges {
  @Input() item: Observable<Item | null> | Item | null = null;
  @Input() readonly = false;
  @Input() equipOnChange = true;
  // The equipment slot card shows the owned/raid/rare/artifact badges in its own header instead.
  @Input() showLootBadges = true;
  @Input() highlightAffixName: string | null = null;
  @Input() highlightBonusType: string | null = null;
  curItem: Item | null = null;
  essenceCraftingML: number | null = null;
  affixRows: AffixDisplayRow[] = [];
  craftingRows: CraftingDisplayRow[] = [];
  bonusRows: ItemBonusDisplayRow[] = [];
  /** A bonus list shorter than a crafting list that gets the full picker is shown compact. */
  readonly craftingPickerMinOptions = CRAFTING_PICKER_MIN_OPTIONS;
  setRows: SetDisplayRow[] = [];
  @ViewChildren(CraftingSlotControlComponent) private craftingControls?: QueryList<CraftingSlotControlComponent>;
  private subscriptions = new Subscription();
  private destroyed = false;
  private bonusOptionLists = new WeakMap<readonly CraftableOption[], CraftableOption[]>();

  constructor(
    public equipped: EquippedService,
    public essenceCrafting: EssenceCraftingService,
    private affixSvc: AffixService,
    private affixUi: AffixUiService,
    private questService: QuestService,
    private userGear: UserGearService,
    private changeDetector: ChangeDetectorRef,
    private suggestionDrawer: SuggestionDrawerService,
    private itemBonuses: ItemBonusService,
    private itemBonusSettings: ItemBonusSettingsService,
    private affixDescriptions: AffixDescriptionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['item'] && !(this.item instanceof Observable)) {
      this.setCurrentItem(this.item);
      this.changeDetector.markForCheck();
    }
  }

  ngOnInit() {
    if (this.item instanceof Observable) {
      this.subscriptions.add(this.item.subscribe(val => {
        this.setCurrentItem(val);
        this.changeDetector.markForCheck();
      }));
    } else {
      this.setCurrentItem(this.item);
    }

    this.subscriptions.add(this.userGear.userItemsChanged$.subscribe(() => {
      this.changeDetector.markForCheck();
    }));
    this.subscriptions.add(this.equipped.getImportantAffixesObservable().subscribe(() => {
      this.refreshDisplayRows();
      this.changeDetector.markForCheck();
    }));
    this.subscriptions.add(this.equipped.getActiveSetBonusesObservable().subscribe(() => {
      this.refreshDisplayRows();
      this.changeDetector.markForCheck();
    }));
    // The rows are built before the descriptions' lazy chunk may have arrived; their details come with it.
    if (!this.affixDescriptions.loaded) {
      this.affixDescriptions.load().then(() => {
        if (this.destroyed) return;
        this.affixRows = this.buildAffixRows();
        this.changeDetector.markForCheck();
      });
    }
    // A system switched on or off adds or removes its row. skip(1): the current set is already in the rows.
    this.subscriptions.add(this.itemBonusSettings.getEnabledKinds().pipe(skip(1)).subscribe(() => {
      this.bonusRows = this.buildBonusRows();
      this.changeDetector.markForCheck();
    }));
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.subscriptions.unsubscribe();
  }

  private setCurrentItem(item: Item | null) {
    this.curItem = item;
    this.essenceCraftingML = this.curItem ? this.curItem.ml : null;
    this.refreshDisplayRows();
  }

  private refreshDisplayRows() {
    const done = perfAggregateStart('GearDescriptionComponent.refreshDisplayRows');
    normalizeAugmentSlots(this.curItem);
    this.affixRows = this.buildAffixRows();
    this.craftingRows = this.buildCraftingRows();
    this.bonusRows = this.buildBonusRows();
    this.setRows = this.buildSetRows();
    done({
      validItems: this.curItem ? 1 : 0,
      affixRows: this.affixRows.length,
      craftingRows: this.craftingRows.length,
      setRows: this.setRows.length
    });
  }

  private buildAffixRows(): AffixDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildAffixRows');
    if (!this.curItem?.affixes) {
      done();
      return [];
    }

    // Ranked as if this item were equipped in its slot - which, for the equipped item, it is.
    const candidate = this.affixUi.candidateFor(this.curItem);
    const rows = this.curItem.getUpgradedOwnAffixes().map(({ affix, replaced, by }) => {
      return {
        affix,
        className: this.affixUi.getClassForAffix(affix, undefined, candidate),
        tooltip: this.affixUi.getAffixTooltip(affix, undefined, this.curItem?.slot, candidate),
        important: this.equipped.isImportantAffix(affix.name),
        details: this.affixUi.getAffixDetails(affix),
        valueText: affix.hasRealType() ? this.affixUi.getAffixValueText(affix) : '',
        upgradeNote: replaced && by ? this.upgradeNote(replaced, by) : ''
      };
    });
    done({ rows: rows.length });
    return rows;
  }

  /** "Tier 2 - was Sonic Lore 10 Equipment": an upgraded row's tooltip. */
  private upgradeNote(replaced: Affix, by: CraftableOption): string {
    const was = replaced.hasRealType()
      ? `${replaced.name} ${this.affixUi.getAffixValueText(replaced)}`
      : replaced.name;
    return `${by.describe()} - was ${was}`;
  }

  private buildCraftingRows(): CraftingDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildCraftingRows');
    if (!this.curItem?.crafting) {
      done();
      return [];
    }

    const item = this.curItem;
    const rows = item.crafting.filter(craft => isCraftingSlotAvailable(item, craft)).map(craft => {
      const selectedAffix = craft.selected?.affixes?.[0];
      return {
        craft,
        important: selectedAffix ? this.equipped.isImportantAffix(selectedAffix.name) : false
      };
    });
    done({ rows: rows.length });
    return rows;
  }

  /**
   * The Mythic, Reaper and Curse rows, built like crafting rows: the chosen bonus ranked with the item as
   * it is, and each option ranked as if it replaced it. Every list uses the crafting picker, whose entries wrap.
   */
  private buildBonusRows(): ItemBonusDisplayRow[] {
    const item = this.curItem;
    if (!item) {
      return [];
    }
    // Only an equipped item's bonuses can be chosen: a suggestion or preview is game data's item, which has none.
    const editable = !this.readonly && this.equipOnChange;
    const candidate = this.affixUi.candidateFor(item);
    const rows: ItemBonusDisplayRow[] = [];
    for (const kind of ITEM_BONUS_KINDS) {
      const carried = item.bonuses[kind];
      const visibleOptions = editable ? this.bonusOptions(kind, item.slot) : [];
      if (!carried && !(this.itemBonusSettings.isEnabled(kind) && visibleOptions.length)) {
        continue;
      }
      const selected = carried ?? this.itemBonuses.none;
      const context: CraftingOptionContext = { item, bonusKind: kind };
      const selectedAffix = selected.affixes[0];
      rows.push({
        kind,
        label: ITEM_BONUS_KIND_LABELS[kind],
        selected,
        context,
        visibleOptions,
        className: this.affixUi.getClassForCraftingOption(selected, candidate),
        tooltip: this.affixUi.getCraftingOptionRankTooltip(selected, item.slot, candidate),
        important: selectedAffix ? this.equipped.isImportantAffix(selectedAffix.name) : false,
        selectedOptionTooltip: this.affixUi.getCraftingOptionTooltip(selected),
      });
    }
    return rows;
  }

  /** None, then the bonuses of a kind the slot can carry: one array per list, so the picker's grouping of it stays cached. */
  private bonusOptions(kind: ItemBonusKind, slot: string): CraftableOption[] {
    const options = this.itemBonuses.getOptions(kind, slot);
    if (!options.length) {
      return [];
    }
    let withNone = this.bonusOptionLists.get(options);
    if (!withNone) {
      withNone = [this.itemBonuses.none, ...options];
      this.bonusOptionLists.set(options, withNone);
    }
    return withNone;
  }

  chooseItemBonus(row: ItemBonusDisplayRow, option: CraftableOption) {
    if (!this.curItem) {
      return;
    }
    if (option === this.itemBonuses.none) {
      delete this.curItem.bonuses[row.kind];
    } else {
      this.curItem.bonuses[row.kind] = option;
    }
    this.updateItem();
  }

  private buildSetRows(): SetDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildSetRows');
    if (!this.curItem) {
      done();
      return [];
    }

    const activeSets = this.equipped.getActiveSets();
    const rows = (this.curItem.getSets() || []).map(set => ({
      name: set,
      count: activeSets.get(set)
    }));
    done({ rows: rows.length });
    return rows;
  }

  updateItem() {
    const done = perfStart('GearDescriptionComponent.updateItem');
    if (this.curItem && this.equipOnChange) {
      this.equipped.set(this.curItem);
    }
    this.refreshDisplayRows();
    // A change to one slot changes how the item's other slots' options rank.
    this.craftingControls?.forEach(control => control.refresh());
    this.changeDetector.markForCheck();
    done();
    perfAfterFrames('paint after crafting option change');
  }

  updateML() {
    const done = perfStart('GearDescriptionComponent.updateML');
    if (this.curItem && this.essenceCraftingML !== null) {
      this.essenceCrafting.setItemToML(this.curItem, this.essenceCraftingML);
      if (this.equipOnChange) {
        this.equipped.set(this.curItem);
      }
      this.refreshDisplayRows();
      this.changeDetector.markForCheck();
    }
    done();
    perfAfterFrames('paint after crafting ML change');
  }

  isHighlightedAffix(affix: Affix): boolean {
    const affixes = [affix].concat(this.affixSvc.ungroupAffix(affix));
    return affixes.some(candidate =>
      candidate.name === this.highlightAffixName
      && (!this.highlightBonusType || candidate.type === this.highlightBonusType));
  }

  isHighlightedCraftingRow(row: CraftingDisplayRow): boolean {
    const selectedAffix = row.craft.selected?.affixes?.[0];
    return !!selectedAffix && this.isHighlightedAffix(selectedAffix);
  }

  userOwnsItem(item: Item | null): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item | null): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  isRaidLoot(item: Item | null): boolean {
    return this.questService.isRaidLoot(item);
  }

  getLootSources(item: Item | null): ReadonlyArray<string> {
    return this.questService.getLootSources(item);
  }

  getLootSourceLabel(item: Item | null): string {
    return this.questService.getLootSourceLabel(item);
  }

  showItemsInSet(setName: string) {
    this.suggestionDrawer.openSet(setName);
  }
}
