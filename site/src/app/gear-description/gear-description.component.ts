import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CraftableOption } from './../craftable-option';
import { Component, OnInit, Input } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { CannithService } from '../cannith.service';
import { AffixService } from '../affix.service';
import { AffixUiService } from '../affix-ui.service';

import { Affix } from '../affix';
import { AffixRank } from '../affix-rank.enum';
import { Craftable } from '../craftable';
import { Item } from '../item';
import { Observable } from 'rxjs';

import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';

@Component({
    selector: 'app-gear-description',
    templateUrl: './gear-description.component.html',
    styleUrls: ['./gear-description.component.css'],
    standalone: false
})
export class GearDescriptionComponent implements OnInit {
  @Input() item: Observable<Item> | Item;
  @Input() readonly = false;
  curItem: Item = null;
  cannithML: number;

  constructor(
    public equipped: EquippedService,
    public cannith: CannithService,
    private affixSvc: AffixService,
    private modalService: NgbModal,
    private affixUi: AffixUiService
  ) {
  }

  ngOnInit() {
    if (this.item instanceof Observable) {
      this.item.subscribe(val => {
        this.curItem = val;
        this.cannithML = this.curItem ? this.curItem.ml : null;
      });
    } else {
      this.curItem = this.item;
      this.cannithML = this.curItem ? this.curItem.ml : null;
    }
  }

  describe(option: CraftableOption) {
    if (option) {
      return option.describe();
    }
    return '';
  }

  updateItem() {
    this.equipped.set(this.curItem);
  }

  updateML() {
    this.cannith.setItemToML(this.curItem, this.cannithML);
    this.equipped.set(this.curItem);
  }

  getAffixValue(affix: Affix) {
    return this.affixUi.getAffixValue(affix);
  }

  getClassForAffix(affix: Affix, option?: CraftableOption) {
    return this.affixUi.getClassForAffix(affix, option);
  }

  getAffixTooltip(affix: Affix, option?: CraftableOption): string {
    return this.affixUi.getAffixTooltip(affix, option);
  }

  getClassForCraftable(craft: Craftable) {
    return this.affixUi.getClassForCraftable(craft);
  }

  getClassForCraftingOption(option: CraftableOption) {
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
