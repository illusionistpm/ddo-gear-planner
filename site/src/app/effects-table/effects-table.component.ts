import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { AffixService } from '../affix.service';
import { ItemsWithBonusTypeComponent } from '../items-with-bonus-type/items-with-bonus-type.component';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from '../affix-organization';

interface TrackedAffixGroupDisplay extends AffixGroupDisplay {
  checklistAffixes: string[];
}

@Component({
    selector: 'app-effects-table',
    templateUrl: './effects-table.component.html',
    styleUrls: ['./effects-table.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class EffectsTableComponent implements OnInit {

  public affixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public affixNames: Array<string> = [];

  public boolAffixMap: Map<string, Array<any>> = new Map<string, Array<any>>();
  public boolAffixNames: Array<string> = [];

  public sortOrder = ['Equipment', 'Enhancement', 'DUMMY', 'Insight', 'Quality', 'Exceptional', 'Artifact', undefined, 'Penalty'];
  collapsedAffixGroups = new Set<string>();

  @Input() sortOwnedToTop: boolean = true;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
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

  removeAffix(affixName: string) {
    this.equipped.removeImportantAffix(affixName);
  }

  currentBonus(affixName: string) {
    let total = 0;
    const types = this.affixMap.get(affixName) || [];
    for (const type of types) {
      total += type.value;
    }
    return total;
  }

  maxBonus(affixName: string) {
    return this.gearDB.getBestValueForAffix(affixName);
  }

  showItemsWithBonusType(affixName: string, bonusType: string) {
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
    const types = this.affixMap.get(affixName) || [];
    return this.sortTypeList(types);
  }

  private sortTypeList(types: Array<any>) {
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

  isBonusTypeAvailable(affixName: string, type: any): boolean {
    return this.gearDB.getBestValueForAffixType(affixName, type.bonusType) > 0;
  }

  isBonusTypeUnavailableAtCurrentLevelRange(affixName: string, type: any): boolean {
    return !this.isBonusTypeAvailable(affixName, type);
  }

  shouldShowMaxAvailable(affixName: string, type: any): boolean {
    return this.gearDB.getBestValueForAffixType(affixName, type.bonusType) > 0;
  }

  getVisibleTypes(affixName: string) {
    const currentTypes = this.affixMap.get(affixName) || [];
    const typeMap = new Map<string, any>();

    for (const type of currentTypes) {
      if (type.bonusType !== 'Penalty') {
        typeMap.set(type.bonusType, type);
      }
    }

    for (const bonusType of this.gearDB.getAllLevelTypesForAffix(affixName)) {
      if (bonusType !== 'Penalty' && !typeMap.has(bonusType)) {
        typeMap.set(bonusType, { bonusType, value: 0 });
      }
    }

    return this.sortTypeList(Array.from(typeMap.values()));
  }

  getBonusTypeTooltip(affixName: string, type: any): string {
    if (this.isBonusTypeUnavailableAtCurrentLevelRange(affixName, type)) {
      return 'No gear with this bonus type is available in the current level range.';
    }

    return this.getValueTooltip(affixName, type);
  }

  getFilteredBoolAffixNames(): string[] {
    return this.boolAffixNames
      .sort((left, right) => left.localeCompare(right));
  }

  getAffixGroups(): AffixGroupDisplay[] {
    return groupAffixNames(this.affixNames, '', this.affixSvc);
  }

  getTrackedAffixGroups(): TrackedAffixGroupDisplay[] {
    const groups = this.getAffixGroups().map(group => ({
      ...group,
      checklistAffixes: [] as string[]
    }));
    const checklistAffixes = this.getFilteredBoolAffixNames();
    if (!checklistAffixes.length) {
      return groups;
    }

    const utilityGroup = groups.find(group => group.name === UTILITY_CHECKLIST_CATEGORY);
    if (utilityGroup) {
      utilityGroup.checklistAffixes = checklistAffixes;
      return groups;
    }

    const utilityIndex = groups.findIndex(group => group.name === 'Immunities' || group.name === 'Other');
    const insertIndex = utilityIndex >= 0 ? utilityIndex : groups.length;
    groups.splice(insertIndex, 0, {
      name: UTILITY_CHECKLIST_CATEGORY,
      affixes: [],
      checklistAffixes
    });
    return groups;
  }

  getAffixGroupCount(group: TrackedAffixGroupDisplay): number {
    return group.affixes.length + group.checklistAffixes.length;
  }

  getAffixGroupClass(groupName: string): string {
    return 'tracked-affix-section-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  toggleAffixGroup(groupName: string) {
    if (this.collapsedAffixGroups.has(groupName)) {
      this.collapsedAffixGroups.delete(groupName);
    } else {
      this.collapsedAffixGroups.add(groupName);
    }
  }

  isAffixGroupCollapsed(groupName: string): boolean {
    return this.collapsedAffixGroups.has(groupName);
  }

  private _isBoolAffix(entry: [string, Array<any>]) {
    return entry[1].length === 1 && entry[1][0].bonusType === 'Bool';
  }

  private getModerateThreshold(maxValue: number): number {
    return maxValue * 3 / 4;
  } 

  getClassForValue(affixName: string, type: any) {
    if (type.bonusType === 'Penalty') {
      return 'penalty-value';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(affixName, type.bonusType);

    if (type.value >= maxValue) {
      return 'max-value';
    } else if (type.value >= this.getModerateThreshold(maxValue)) {
      return 'mid-value';
    } else {
      return 'low-value';
    }
  }

  getValueTooltip(affixName: string, type: any): string {
    if (type.bonusType === 'Penalty') {
      return 'Penalty effect';
    }

    const maxValue = this.gearDB.getBestValueForAffixType(affixName, type.bonusType);
    const shortBy = maxValue - type.value;

    if (maxValue === 0) {
      return 'No gear with this bonus type is available in the current level range.';
    }

    if (type.value >= maxValue) {
      return 'Best possible value';
    } else if (type.value >= this.getModerateThreshold(maxValue)) {
      return `Moderate value (${shortBy} below max)`;
    } else {
      return `Low value (${shortBy} below max)`;
    }
  }
}
