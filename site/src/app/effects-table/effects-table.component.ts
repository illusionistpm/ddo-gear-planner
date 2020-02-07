import { Component, OnInit } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { ItemsWithBonusTypeComponent } from '../items-with-bonus-type/items-with-bonus-type.component';

@Component({
  selector: 'app-effects-table',
  templateUrl: './effects-table.component.html',
  styleUrls: ['./effects-table.component.css']
})
export class EffectsTableComponent implements OnInit {

  public effects: Map<string, Array<any>>;
  public effectKeys: Array<any>;

  public sortOrder = ['Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private modalService: NgbModal
  ) {
    this.effectKeys = new Array<object>();
  }

  ngOnInit() {
    this.equipped.getCoveredAffixes().subscribe(map => {
      this.effects = map;
      this.effectKeys = [];
      for (const key of this.effects.keys()) {
        this.effectKeys.push({ name: key });
      }
    });
  }

  removeAffix(affixName) {
    this.equipped.removeImportantAffix(affixName);
  }

  currentBonus(affixName) {
    let total = 0;
    for (const type of this.effects.get(affixName)) {
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

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  sortTypes(affixName: string) {
    const types = this.effects.get(affixName);
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
