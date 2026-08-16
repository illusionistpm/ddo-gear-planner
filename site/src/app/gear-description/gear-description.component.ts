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
import { perfAfterFrames, perfCount, perfStart } from '../perf-trace';

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
  className: string;
  tooltip: string;
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
    this.affixRows = this.buildAffixRows();
    this.craftingRows = this.buildCraftingRows();
    this.setRows = this.buildSetRows();
  }

  private buildAffixRows(): AffixDisplayRow[] {
    if (!this.curItem?.affixes) {
      return [];
    }

    return this.curItem.affixes.map(affix => {
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
  }

  private buildCraftingRows(): CraftingDisplayRow[] {
    if (!this.curItem?.crafting) {
      return [];
    }

    return this.curItem.crafting.map(craft => {
      const selectedAffix = craft.selected?.affixes?.[0];
      const selectedAffixGroup = selectedAffix ? this.affixSvc.isAffixGroup(selectedAffix) : false;
      return {
        craft,
        className: this.affixUi.getClassForCraftable(craft),
        tooltip: selectedAffix ? this.affixUi.getAffixTooltip(selectedAffix, craft.selected) : '',
        important: selectedAffix ? this.equipped.isImportantAffix(selectedAffix.name) : false,
        selectedAffixGroup,
        selectedGroupTooltip: selectedAffix && selectedAffixGroup ? this.affixUi.getAffixGroupTooltip(selectedAffix) : '',
        options: this.readonly ? [] : (craft.options || []).map(option => ({
          option,
          className: this.affixUi.getClassForCraftingOption(option),
          tooltip: option.affixes?.[0] ? this.affixUi.getAffixTooltip(option.affixes[0], option) : '',
          description: option.describe()
        }))
      };
    });
  }

  private buildSetRows(): SetDisplayRow[] {
    if (!this.curItem) {
      return [];
    }

    const activeSets = this.equipped.getActiveSets();
    return (this.curItem.getSets() || []).map(set => ({
      name: set,
      count: activeSets.get(set)
    }));
  }

  updateItem() {
    const done = perfStart('GearDescriptionComponent.updateItem');
    if (this.curItem) {
      this.equipped.set(this.curItem);
    }
    done();
    perfAfterFrames('paint after crafting option change');
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
