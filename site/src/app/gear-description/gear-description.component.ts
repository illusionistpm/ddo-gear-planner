import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CraftableOption } from './../craftable-option';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { EssenceCraftingService } from '../essence-crafting.service';
import { AffixService } from '../affix.service';
import { AffixUiService } from '../affix-ui.service';

import { Affix } from '../affix';
import { AffixRank } from '../affix-rank.enum';
import { Craftable } from '../craftable';
import { Item } from '../item';
import { Observable, Subscription } from 'rxjs';

import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';
import { perfAfterFrames, perfAggregateStart, perfCount, perfStart } from '../perf-trace';

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
export class GearDescriptionComponent implements OnInit, OnDestroy {
  @Input() item: Observable<Item> | Item | null = null;
  @Input() readonly = false;
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
    private modalService: NgbModal,
    private affixUi: AffixUiService,
    private changeDetector: ChangeDetectorRef
  ) {
  }

  ngOnInit() {
    if (this.item instanceof Observable) {
      this.subscriptions.add(this.item.subscribe(val => {
        this.curItem = val;
        this.essenceCraftingML = this.curItem ? this.curItem.ml : null;
        this.refreshDisplayRows();
        this.changeDetector.markForCheck();
      }));
    } else {
      this.curItem = this.item;
      this.essenceCraftingML = this.curItem ? this.curItem.ml : null;
      this.refreshDisplayRows();
    }

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

  describe(option: CraftableOption) {
    perfCount('GearDescriptionComponent.describe');
    if (option) {
      return option.describe();
    }
    return '';
  }

  private refreshDisplayRows() {
    const done = perfAggregateStart('GearDescriptionComponent.refreshDisplayRows');
    this.affixRows = this.buildAffixRows();
    this.craftingRows = this.buildCraftingRows();
    this.setRows = this.buildSetRows();
    done({
      validItems: this.curItem?.isValid() ? 1 : 0,
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
        tooltip: this.affixUi.getAffixTooltip(affix),
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

    const rows = this.curItem.crafting.map(craft => {
      const selectedAffix = craft.selected?.affixes?.[0];
      const selectedAffixGroup = selectedAffix ? this.affixSvc.isAffixGroup(selectedAffix) : false;
      return {
        craft,
        className: this.affixUi.getClassForCraftable(craft),
        tooltip: selectedAffix ? this.affixUi.getAffixTooltip(selectedAffix, craft.selected) : '',
        important: selectedAffix ? this.equipped.isImportantAffix(selectedAffix.name) : false,
        selectedAffixGroup,
        selectedGroupTooltip: selectedAffix && selectedAffixGroup ? this.affixUi.getAffixGroupTooltip(selectedAffix) : '',
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

  private buildCraftingOptionRows(craft: Craftable, includeRank: boolean, includeAllOptions: boolean): CraftingOptionDisplayRow[] {
    const done = perfAggregateStart('GearDescriptionComponent.buildCraftingOptionRows');
    if (this.readonly) {
      done();
      return [];
    }

    const options = includeAllOptions ? (craft.options || []) : [craft.selected];
    const rows = options.map(option => ({
      option,
      className: includeRank ? this.affixUi.getClassForCraftingOption(option) : undefined,
      tooltip: includeRank && option.affixes?.[0] ? this.affixUi.getAffixTooltip(option.affixes[0], option) : undefined,
      description: option.describe()
    }));
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
    if (this.curItem) {
      this.equipped.set(this.curItem);
    }
    done();
    perfAfterFrames('paint after crafting option change');
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
      this.equipped.set(this.curItem);
    }
    done();
    perfAfterFrames('paint after crafting ML change');
  }

  getAffixValue(affix: Affix) {
    perfCount('GearDescriptionComponent.getAffixValue');
    return this.affixUi.getAffixValue(affix);
  }

  getClassForAffix(affix: Affix, option?: CraftableOption) {
    perfCount('GearDescriptionComponent.getClassForAffix');
    return this.affixUi.getClassForAffix(affix, option);
  }

  getAffixTooltip(affix: Affix, option?: CraftableOption): string {
    perfCount('GearDescriptionComponent.getAffixTooltip');
    return this.affixUi.getAffixTooltip(affix, option);
  }

  getAffixGroupTooltip(affix: Affix): string {
    perfCount('GearDescriptionComponent.getAffixGroupTooltip');
    return this.affixUi.getAffixGroupTooltip(affix);
  }

  isAffixGroup(affix: Affix): boolean {
    perfCount('GearDescriptionComponent.isAffixGroup');
    return this.affixSvc.isAffixGroup(affix);
  }

  getClassForCraftable(craft: Craftable) {
    perfCount('GearDescriptionComponent.getClassForCraftable');
    return this.affixUi.getClassForCraftable(craft);
  }

  getClassForCraftingOption(option: CraftableOption) {
    perfCount('GearDescriptionComponent.getClassForCraftingOption');
    return this.affixUi.getClassForCraftingOption(option);
  }

  // Duplicated from gear-craftingList
  showItemsInSet(setName: string) {
    const dlg = this.modalService.open(ItemsInSetComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.setName = setName;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

}
