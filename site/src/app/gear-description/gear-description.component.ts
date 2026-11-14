import { ChangeDetectorRef, Component, OnDestroy, OnInit, Input, ChangeDetectionStrategy, OnChanges, QueryList, SimpleChanges, ViewChildren } from '@angular/core';

import { EquippedService } from '../planner/equipped.service';
import { EssenceCraftingService } from '../gear/essence-crafting.service';
import { AffixService } from '../affixes/affix.service';
import { AffixUiService } from '../affixes/affix-ui.service';
import { Affix } from '../affixes/affix';
import { Craftable } from '../gear/craftable';
import { Item } from '../gear/item';
import { Observable, Subscription } from 'rxjs';

import { perfAfterFrames, perfAggregateStart, perfStart } from '../shared/perf-trace';
import { QuestService } from '../gear/quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { isCraftingSlotAvailable, normalizeAugmentSlots } from '../gear/augment-slots';
import { CraftingSlotControlComponent } from '../crafting-slot-control/crafting-slot-control.component';

interface AffixDisplayRow {
  affix: Affix;
  className: string;
  tooltip: string;
  important: boolean;
  affixGroup: boolean;
  groupTooltip: string;
  valueText: string;
}

/** A crafting slot's row; its controls are a CraftingSlotControlComponent's. */
interface CraftingDisplayRow {
  craft: Craftable;
  important: boolean;
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
  @ViewChildren(CraftingSlotControlComponent) private craftingControls?: QueryList<CraftingSlotControlComponent>;
  private subscriptions = new Subscription();

  constructor(
    public equipped: EquippedService,
    public essenceCrafting: EssenceCraftingService,
    private affixSvc: AffixService,
    private affixUi: AffixUiService,
    private questService: QuestService,
    private userGear: UserGearService,
    private changeDetector: ChangeDetectorRef,
    private suggestionDrawer: SuggestionDrawerService
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
  }

  ngOnDestroy() {
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
    const rows = this.curItem.affixes.map(affix => {
      const affixGroup = this.affixSvc.isAffixGroup(affix);
      return {
        affix,
        className: this.affixUi.getClassForAffix(affix, undefined, candidate),
        tooltip: this.affixUi.getAffixTooltip(affix, undefined, this.curItem?.slot, candidate),
        important: this.equipped.isImportantAffix(affix.name),
        affixGroup,
        groupTooltip: affixGroup ? this.affixUi.getAffixGroupTooltip(affix) : '',
        valueText: affix.hasRealType() ? this.affixUi.getAffixValueText(affix) : ''
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
