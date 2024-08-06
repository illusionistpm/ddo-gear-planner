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
  spellSchools: Array<string>;
  tactics: Array<string>;

  showTactics: boolean = false;
  showSpellpowers: boolean = false;
  showSpellSchools: boolean = false;

  public allAffixes: Array<any>; // is really Array<{name:string}>

  ignoredSet: Set<string>;

  attributes = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  packages = new Map<string, Array<string>>();
  packageKeys = [];

  spellpowerPackages = new Map<string, Array<string>>();
  spellpowerPackageKeys = [];

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
  ) {
    this.workingMap = new Map<string, number>();
    this.savedSet = new Set<string>();
    this.topResults = new Array<any>();
    this.ignoredSet = new Set<string>();

    this.allAffixes = this.gearDB.getAllAffixes().map(e => ({ name: e }));

    this.spellSchools = ['Evocation', 'Transmutation', 'Abjuration', 'Conjuration', 'Enchantment', 'Illusion', 'Necromancy'];
    this.tactics = ['Stunning', 'Sundering', 'Vertigo'];

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

    this._initPackages();
  }

  ngOnInit() {
    for (const affix of this.equipped.getImportantAffixes()) {
      this.add(affix);
    }
  }

  _initPackages() {
    this.packages.set('Basic', ['Healing Amplification', 'Sheltering', 'Physical Sheltering',
      'Magical Sheltering', 'Constitution', 'Dodge', 'Resistance', 'Blurry', 'Parrying', 'Ghostly',
      'Fortification', 'False Life', 'Speed', 'Freedom of Movement', 'Feather Falling', 'Blindness Immunity',
      'Heroic Inspiration']);
    this.packages.set('Melee', ['Melee Alacrity', 'Melee Power', 'Doublestrike', 'Deadly', 'Accuracy', 'Armor-Piercing', 'Armor Class']);
    this.packages.set('Ranged', ['Ranged Alacrity', 'Ranged Power', 'Doubleshot', 'Deadly', 'Accuracy', 'Armor-Piercing']);
    this.packages.set('Caster', ['Universal Spell Power', 'Universal Spell Lore', 'Spellcraft', 'Wizardry', 'Spell Penetration', 'Spell Focus Mastery']);
    this.packages.set('Trapping', ['Open Lock', 'Disable Device', 'Spot', 'Search']);
    this.packageKeys = Array.from(this.packages.keys());

    this.spellpowerPackages.set('Healing', ['Devotion', 'Healing Lore', 'Heal']);
    this.spellpowerPackages.set('Kinetic', ['Impulse', 'Kinetic Lore', 'Force Spell Crit Damage']);
    this.spellpowerPackages.set('Fire', ['Combustion', 'Fire Lore', 'Fire Spell Crit Damage']);
    this.spellpowerPackages.set('Cold', ['Glaciation', 'Ice Lore', 'Ice Spell Crit Damage']);
    this.spellpowerPackages.set('Lightning', ['Magnetism', 'Lightning Lore', 'Lightning Spell Crit Damage']);
    this.spellpowerPackages.set('Acid', ['Corrosion', 'Acid Lore', 'Acid Spell Crit Damage']);
    this.spellpowerPackages.set('Negative', ['Nullification', 'Void Lore', 'Negative Spell Crit Damage']);
    this.spellpowerPackages.set('Light & Alignment', ['Radiance', 'Radiance Lore', 'Radiance Spell Crit Damage']);
    this.spellpowerPackages.set('Repair', ['Reconstruction', 'Repair Lore']);
    this.spellpowerPackages.set('Sonic', ['Resonance', 'Sonic Lore', 'Perform', 'Sonic Spell Crit Damage']);
    this.spellpowerPackageKeys = Array.from(this.spellpowerPackages.keys());
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

  addPackage(pkg: string) {
    if (pkg == 'Melee') {
      this.showTactics = true;
    } else if (pkg == 'Caster') {
      this.showSpellSchools = true;
      this.showSpellpowers = true;
    }
    for (const affix of this.packages.get(pkg)) {
      this.add(affix);
    }
  }

  addTactic(tactic: string) {
    this.add(tactic);
  }

  addSpellSchool(spellSchool: string) {
    this.add(spellSchool + ' Focus');
  }

  addSpellpower(spellpower: string) {
    for (const affix of this.spellpowerPackages.get(spellpower)) {
      this.add(affix);
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
      if (this.savedSet.has(entry[0]) || this.ignoredSet.has(entry[0]) || this.attributes.includes(entry[0])) {
        this.workingMap.delete(entry[0]);
      }
    }

    this.topResults = Array.from(this.workingMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }

  remove(affix: string) {
    this.savedSet.delete(affix);
    this.equipped.removeImportantAffix(affix);

    this.workingMap.clear();
    this.savedSet.forEach((a, b, s) => this.add(a));
  }

  onChange() {
    return (affix: any) => {
      this.add(affix.name);
    };
  }
}
