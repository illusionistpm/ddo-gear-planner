import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { ItemsWithBonusTypeComponent } from '../items-with-bonus-type/items-with-bonus-type.component';

@Component({
    selector: 'app-effects-table',
    templateUrl: './effects-table.component.html',
    styleUrls: ['./effects-table.component.css'],
    standalone: false
})
export class EffectsTableComponent implements OnInit {

  public affixMap: Map<string, Array<any>>;
  public affixNames: Array<string>;

  public boolAffixMap: Map<string, Array<any>>;
  public boolAffixNames: Array<string>;

  public sortOrder = ['Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];

  @Input() sortOwnedToTop: boolean = true;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private modalService: NgbModal
  ) {
    this.affixNames = [];
    this.boolAffixNames = [];
  }

  ngOnInit() {
    this.equipped.getCoveredAffixes().subscribe(map => {
      this.affixMap = new Map<string, Array<any>>();
      this.boolAffixMap = new Map<string, Array<any>>();
      this.affixNames = [];
      this.boolAffixNames = [];

      for (const entry of map.entries()) {
        if (this._isBoolAffix(entry)) {
          this.boolAffixMap.set(entry[0], entry[1]);
          this.boolAffixNames.push(entry[0]);
        } else {
          this.affixMap.set(entry[0], entry[1]);
          this.affixNames.push(entry[0]);
        }
      }
    });
  }

  removeAffix(affixName) {
    this.equipped.removeImportantAffix(affixName);
  }

  currentBonus(affixName) {
    let total = 0;
    for (const type of this.affixMap.get(affixName)) {
      total += type.value;
    }
    return total;
  }

  maxBonus(affixName) {
    return this.gearDB.getBestValueForAffix(affixName);
  }

  showItemsWithBonusType(affixName, bonusType) {
    const dlg = this.modalService.open(ItemsWithBonusTypeComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.affixName = affixName;
    dlg.componentInstance.bonusType = bonusType;
    dlg.componentInstance.sortOwnedToTop = this.sortOwnedToTop;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  sortTypes(affixName: string) {
    const types = this.affixMap.get(affixName);
    return types.sort((a, b) => {
      let aIndex = this.sortOrder.indexOf(a.bonusType);
      if (aIndex === -1) {
        aIndex = this.sortOrder.indexOf('DUMMY');
      }

      let bIndex = this.sortOrder.indexOf(b.bonusType);
      if (bIndex === -1) {
        bIndex = this.sortOrder.indexOf('DUMMY');
      }

      const diff = aIndex - bIndex;
      if (diff !== 0) {
        return diff;
      }

      return a.bonusType.localeCompare(b.bonusType);
    });
  }

  private _isBoolAffix(entry) {
    return entry[1].length === 1 && entry[1][0].bonusType === 'bool';
  }

  getClassForValue(affixName, type) {
    if (type.bonusType === 'Penalty') {
      return 'penalty-value';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(affixName, type.bonusType);

    if (type.value >= maxValue) {
      return 'max-value';
    } else if (type.value >= maxValue / 2) {
      return 'mid-value';
    } else {
      return 'low-value';
    }
  }
}
