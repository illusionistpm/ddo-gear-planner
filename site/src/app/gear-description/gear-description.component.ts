import { CraftableOption } from './../craftable-option';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, Input, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { EssenceCraftingService } from '../essence-crafting.service';
import { AffixService } from '../affix.service';
import { AffixUiService } from '../affix-ui.service';

import { Affix } from '../affix';
import { Craftable } from '../craftable';
import { Item } from '../item';
import { Observable, Subscription } from 'rxjs';

import { perfAfterFrames, perfAggregateStart, perfCount, perfStart } from '../perf-trace';
import { QuestService } from '../quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { UserGearService, UserItemLocation } from '../user-gear.service';
import { AUGMENT_SLOT_1, AUGMENT_SLOT_2, availableSecondSlotSystems, canHaveSecondAugmentSlot, isCraftingSlotAvailable } from '../augment-slots';

interface AffixDisplayRow {
  affix: Affix;
  className: string;
  tooltip: string;
  important: boolean;
  affixGroup: boolean;
  groupTooltip: string;
  valueText: string;
}

interface CraftingOptionDisplayRow {
  option: CraftableOption;
  className?: string;
  tooltip?: string;
  description: string;
}

interface CraftingDisplayRow {
  craft: Craftable;
  className: string;
  tooltip: string;
  important: boolean;
  selectedAffixGroup: boolean;
  selectedGroupTooltip: string;
  selectedOptionTooltip: string;
  options: CraftingOptionDisplayRow[];
  optionsRanked: boolean;
  optionsLoaded: boolean;
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
  setRows: SetDisplayRow[] = [];
  private subscriptions = new Subscription();
  private rankedCraftingOptions = new WeakSet<Craftable>();
  private loadedCraftingOptions = new WeakSet<Craftable>();

  constructor(
    public equipped: EquippedService,
    public essenceCrafting: EssenceCraftingService,
    private affixSvc: AffixService,
    private affixUi: AffixUiService,
    private questService: QuestService,
    private userGear: UserGearService,
    private changeDetector: ChangeDetectorRef,
    private suggestionDrawer: SuggestionDrawerService
  ) {
  }

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
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  private setCurrentItem(item: Item | null) {
    this.curItem = item;
    this.essenceCraftingML = this.curItem ? this.curItem.ml : null;
    this.refreshDisplayRows();
  }

  describe(option: CraftableOption) {
    perfCount('GearDescriptionComponent.describe');
    if (option) {
      return option.describe();
    }
    return '';
  }

  private refreshDisplayRows() {
    const done = perfAggregateStart('GearDescriptionComponent.refreshDisplayRows');
    this.normalizeAugmentSlotRows();
    this.affixRows = this.buildAffixRows();
    this.craftingRows = this.buildCraftingRows();
    this.setRows = this.buildSetRows();
    done({
      validItems: this.curItem ? 1 : 0,
      affixRows: this.affixRows.length,
      craftingRows: this.craftingRows.length,
      craftingOptionRows: this.craftingRows.reduce((count, row) => count + row.options.length, 0),
      setRows: this.setRows.length
    });
  }

  private buildAffixRows(): AffixDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildAffixRows');
    if (!this.curItem?.affixes) {
      done();
      return [];
    }

    const rows = this.curItem.affixes.map(affix => {
      const affixGroup = this.affixSvc.isAffixGroup(affix);
      return {
        affix,
        className: this.affixUi.getClassForAffix(affix),
        tooltip: this.affixUi.getAffixTooltip(affix, undefined, this.curItem?.slot),
        important: this.equipped.isImportantAffix(affix.name),
        affixGroup,
        groupTooltip: affixGroup ? this.affixUi.getAffixGroupTooltip(affix) : '',
        valueText: affix.hasRealType() ? [this.affixUi.getAffixValue(affix), affix.type].filter(part => part).join(' ') : ''
      };
    });
    done({ rows: rows.length });
    return rows;
  }

  private buildCraftingRows(): CraftingDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildCraftingRows');
    if (!this.curItem?.crafting) {
      done();
      return [];
    }

    const rows = this.curItem.crafting.filter(craft => this.shouldShowCraftingRow(craft)).map(craft => {
      const selectedAffix = craft.selected?.affixes?.[0];
      const selectedAffixGroup = selectedAffix ? this.affixSvc.isAffixGroup(selectedAffix) : false;
      return {
        craft,
        className: this.affixUi.getClassForCraftable(craft),
        tooltip: selectedAffix ? this.affixUi.getAffixTooltip(selectedAffix, craft.selected, this.curItem?.slot) : '',
        important: selectedAffix ? this.equipped.isImportantAffix(selectedAffix.name) : false,
        selectedAffixGroup,
        selectedGroupTooltip: selectedAffix && selectedAffixGroup ? this.affixUi.getAffixGroupTooltip(selectedAffix) : '',
        selectedOptionTooltip: this.affixUi.getCraftingOptionTooltip(craft.selected),
        options: this.buildCraftingOptionRows(craft, this.rankedCraftingOptions.has(craft), this.loadedCraftingOptions.has(craft)),
        optionsRanked: this.readonly || this.rankedCraftingOptions.has(craft),
        optionsLoaded: this.readonly || this.loadedCraftingOptions.has(craft)
      };
    });
    done({
      rows: rows.length,
      optionRows: rows.reduce((count, row) => count + row.options.length, 0),
      rankedOptionRows: rows.reduce((count, row) => count + (row.optionsRanked ? row.options.length : 0), 0)
    });
    return rows;
  }

  private normalizeAugmentSlotRows() {
    const slotOne = this.curItem?.getCraftingByName(AUGMENT_SLOT_1);
    const slotTwo = this.curItem?.getCraftingByName(AUGMENT_SLOT_2);

    if (slotOne && slotTwo) {
      const availableSystems = availableSecondSlotSystems(
        slotOne.selectedCraftingSystemName, slotTwo.getOptionsByCraftingSystem().keys());
      slotTwo.setAvailableCraftingSystemOptions(availableSystems, slotTwo.selectedCraftingSystemName);

      if (!canHaveSecondAugmentSlot(this.curItem)) {
        slotTwo.selectCraftingSystem('');
      }
    }
  }

  private shouldShowCraftingRow(craft: Craftable) {
    return isCraftingSlotAvailable(this.curItem, craft);
  }

  private buildCraftingOptionRows(craft: Craftable, includeRank: boolean, includeAllOptions: boolean): CraftingOptionDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildCraftingOptionRows');
    if (this.readonly) {
      done();
      return [];
    }

    const options = includeAllOptions ? (craft.options || []) : [craft.selected];
    const rows = options.map(option => {
      const rankingTooltip = includeRank && option.affixes?.[0]
        ? this.affixUi.getAffixTooltip(option.affixes[0], option, this.curItem?.slot)
        : '';
      const optionTooltip = this.affixUi.getCraftingOptionTooltip(option);
      return {
        option,
        className: includeRank ? this.affixUi.getClassForCraftingOption(option) : undefined,
        tooltip: [optionTooltip, rankingTooltip].filter(tooltip => tooltip).join('\n\n') || undefined,
        description: option.describe()
      };
    });
    done({
      rows: rows.length,
      rankedRows: includeRank ? rows.length : 0,
      fullOptionLists: includeAllOptions ? 1 : 0
    });
    return rows;
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
    this.changeDetector.markForCheck();
    done();
    perfAfterFrames('paint after crafting option change');
  }

  updateCraftingSystem(row: CraftingDisplayRow) {
    row.craft.selectCraftingSystem(row.craft.selectedCraftingSystemName);
    if (row.craft.name === AUGMENT_SLOT_1 && !canHaveSecondAugmentSlot(this.curItem)) {
      this.curItem?.getCraftingByName(AUGMENT_SLOT_2)?.selectCraftingSystem('');
    }
    this.loadedCraftingOptions.delete(row.craft);
    this.rankedCraftingOptions.delete(row.craft);
    this.updateItem();
  }

  loadAndRankCraftingOptions(row: CraftingDisplayRow) {
    if (row.optionsLoaded && row.optionsRanked) {
      return;
    }

    this.loadedCraftingOptions.add(row.craft);
    this.rankedCraftingOptions.add(row.craft);
    row.options = this.buildCraftingOptionRows(row.craft, true, true);
    row.optionsLoaded = true;
    row.optionsRanked = true;
    this.changeDetector.markForCheck();
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

  getLootSourceLabel(item: Item | null): string {
    return this.questService.getLootSourceLabel(item);
  }

  showItemsInSet(setName: string) {
    this.suggestionDrawer.openSet(setName);
  }

  getCraftingSystemEmptyLabel(craft: Craftable) {
    return craft.hasCraftingSystemOptions() ? 'No augment slot' : craft.name;
  }

}
