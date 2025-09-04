import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { CraftableOption } from './../craftable-option';
import { Component, OnInit, Input } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { CannithService } from '../cannith.service';
import { AffixService } from '../affix.service';

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
    private modalService: NgbModal
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
    if (affix.value) {
      return (affix.value > 0 ? '+' : '') + affix.value;
    }
    return '';
  }

  getClassForAffix(affix: Affix) {
    let affixRank = this.equipped.getAffixRanking(affix);
    if (affixRank === AffixRank.Irrelevant) {
      if (this.affixSvc.isAffixGroup(affix)) {
        affixRank = this._getClassForAffixGroup(affix);
      }
    }
    return AffixRank[affixRank];
  }

  getAffixTooltip(affix: Affix): string {
    if (!affix) return '';
    
    let affixRank = this.equipped.getAffixRanking(affix);
    if (affixRank === AffixRank.Irrelevant) {
      if (this.affixSvc.isAffixGroup(affix)) {
        affixRank = this._getClassForAffixGroup(affix);
      }
    }

    switch (affixRank) {
      case AffixRank.BetterThanBest:
        return 'Better than best equipped value';
      case AffixRank.Best:
        return 'Best equipped value';
      case AffixRank.BestTied:
        return 'Tied for best equipped value';
      case AffixRank.Outranked:
        return 'Overpowered by another affix';
      case AffixRank.Mixed:
        return 'Mixed effectiveness';
      case AffixRank.Penalty:
        return 'Penalty/negative effect';
      default:
        return '';
    }
  }

  private _getClassForAffixGroup(affixGroup: Affix) {
    let affixRank = AffixRank.Irrelevant;
    const affixes = this.affixSvc.flattenAffixGroups([affixGroup]);
    for (const aff of affixes) {
      const curRank = this.equipped.getAffixRanking(aff);
      if (affixRank === AffixRank.Irrelevant) {
        affixRank = curRank;
      } else if (curRank === AffixRank.Irrelevant) {
        // Do nothing
      } else if (affixRank !== curRank) {
        return AffixRank.Mixed;
      }
    }
    return affixRank;
  }

  getClassForCraftable(craft: Craftable) {
    if (!craft?.selected?.affixes?.length) return 'Irrelevant';
    const affixRank = this.equipped.getAffixRanking(craft.selected.affixes[0]);
    return AffixRank[affixRank];
  }

  getClassForCraftingOption(option: CraftableOption) {
    if (!option?.affixes?.length) return 'Irrelevant';
    const affixRank = this.equipped.getAffixRanking(option.affixes[0]);
    return AffixRank[affixRank];
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
