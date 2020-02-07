import { Component, OnInit } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';

import { AffixCloud } from '../affix-cloud';

@Component({
  selector: 'app-affix-cloud',
  templateUrl: './affix-cloud.component.html',
  styleUrls: ['./affix-cloud.component.css']
})
export class AffixCloudComponent implements OnInit {
  cloud: AffixCloud;
  workingMap: Map<string, number>;
  savedSet: Set<string>;
  topResults: Array<any>;

  public allAffixes: Array<any>; // is really Array<{name:string}>

  ignoredSet: Set<string>;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
  ) {
    this.workingMap = new Map<string, number>();
    this.savedSet = new Set<string>();
    this.topResults = new Array<any>();
    this.ignoredSet = new Set<string>();

    this.allAffixes = this.gearDB.getAllAffixes().map(e => ({ name: e }));

    const gearList = gearDB.getGearList();

    let flatList = [];
    for (const entry of gearList.entries()) {
      flatList = flatList.concat(entry[1]);
    }

    this.cloud = new AffixCloud(flatList);

    // This can still be added if you click on the heart. Should be stored somewhere better
    this.ignoredSet.add('Enhancement Bonus');
    this.ignoredSet.add('Orb Bonus');
    this.ignoredSet.add('Spellcasting Implement');
    this.ignoredSet.add('Upgradeable - Primary Augment');
    this.ignoredSet.add('Upgradeable - Secondary Augment');

    this._initTopResults();

    if (this.equipped.getImportantAffixes().size === 0) {
      this._initPackages();
    }
  }

  ngOnInit() {
    for (const affix of this.equipped.getImportantAffixes()) {
      this.add(affix);
    }
  }

  _initTopResults() {
    const seed = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
    for (const affix of seed) {
      this.workingMap.set(affix, 500);
    }
  }

  _initPackages() {
    for (const affix of ['Healing Amplification', 'Sheltering', 'Physical Sheltering',
      'Magical Sheltering', 'Constitution', 'Dodge', 'Resistance', 'Blurry', 'Parrying', 'Ghostly', 
      'Fortification', 'Hit Points', 'Vitality', 'False Life', 'Speed']) {
        this.add(affix);
      }
  }

  getBtnSize(result: string) {
    const sortedResults = Array.from(this.workingMap.entries()).sort((a, b) => b[1] - a[1]);
    if (!sortedResults.length) {
      return 'btn';
    }
    const maxVal = sortedResults[0][1];
    const myVal = this.workingMap.get(result[0]);
    if (myVal < maxVal / 3) {
      return 'btn-sm';
    } else if (myVal > 2 / 3 * maxVal) {
      return 'btn-lg';
    } else {
      return 'btn';
    }
  }

  add(affix: string) {
    this.savedSet.add(affix);
    this.equipped.addImportantAffix(affix);

    const map = this.cloud.get(affix);
    if (!map) {
      console.log('Couldn\'t find ' + affix + ' in affix cloud');
      return;
    }

    this.workingMap = this.cloud.merge(this.workingMap, map);
    for (const entry of this.workingMap) {
      if (this.savedSet.has(entry[0]) || this.ignoredSet.has(entry[0])) {
        this.workingMap.delete(entry[0]);
      }
    }

    this.topResults = Array.from(this.workingMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }

  remove(affix: string) {
    this.savedSet.delete(affix);
    this.equipped.removeImportantAffix(affix);

    this._initTopResults();
    this.workingMap.clear();
    this.savedSet.forEach((a, b, s) => this.add(a));
  }

  onChange() {
    return (affix: any) => {
      this.add(affix.name);
    };
  }
}
