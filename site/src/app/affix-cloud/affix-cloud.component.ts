import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';
import { AffixService } from '../affix.service';
import { AnalyticsService } from '../analytics.service';

import { AffixCloud } from '../affix-cloud';
import { AffixGroupDisplay, groupAffixNames, UTILITY_CHECKLIST_CATEGORY } from '../affix-organization';

@Component({
    selector: 'app-affix-cloud',
    templateUrl: './affix-cloud.component.html',
    styleUrls: ['./affix-cloud.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AffixCloudComponent implements OnInit, OnDestroy {
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
  packageKeys: string[] = [];

  spellpowerPackages = new Map<string, Array<string>>();
  spellpowerPackageKeys: string[] = [];

  private importantAffixesSubscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
    private analytics: AnalyticsService
  ) {
    this.workingMap = new Map<string, number>();
    this.savedSet = new Set<string>();
    this.topResults = new Array<any>();
    this.ignoredSet = new Set<string>();

    this.allAffixes = this.gearDB.getAllAffixes().map(e => ({ name: e, synonyms: this.affixSvc.getSynonyms(e) }));

    this.spellSchools = ['Evocation', 'Transmutation', 'Abjuration', 'Conjuration', 'Enchantment', 'Illusion', 'Necromancy'];
    this.tactics = ['Stunning', 'Sundering', 'Vertigo'];

    const gearList = gearDB.getGearList();

    let flatList: any[] = [];
    for (const entry of gearList.entries()) {
      // Skip Weapon and Ring2 to avoid double counting since Offhand is offhand + weapon and ring2 is just ring1
      if (entry[0] === 'Weapon' || entry[0] === 'Ring2') {
        continue;
      }
      flatList = flatList.concat(entry[1]);
    }

    this.cloud = new AffixCloud(flatList);

    // This can still be added if you click on the heart. Should be stored somewhere better
    this.ignoredSet.add('Enhancement Bonus');
    this.ignoredSet.add('Orb Bonus');
    this.ignoredSet.add('Spellcasting Implement');
    this.ignoredSet.add('Upgradeable - Primary Augment');
    this.ignoredSet.add('Upgradeable - Secondary Augment');
    this.ignoredSet.add('Enhancement Bonus (Armor)');
    this.ignoredSet.add('Enhancement Bonus (Weapon)');
    this.ignoredSet.add('Well Rounded');

    this._initPackages();
  }

  ngOnInit() {
    this.importantAffixesSubscription = this.equipped.getImportantAffixesObservable()
      .subscribe(affixes => this.syncFromImportantAffixes(affixes));
  }

  ngOnDestroy() {
    this.importantAffixesSubscription?.unsubscribe();
  }

  _initPackages() {
    this.packages.set('Basic', ['Healing Amplification', 'Physical Sheltering',
      'Magical Sheltering', 'Constitution', 'Dodge', 'Fortitude Save', 'Reflex Save', 'Will Save', 'Blurry', 'Parrying', 'Ghostly',
      'Fortification', 'False Life', 'Speed', 'Freedom of Movement', 'Feather Falling', 'Blindness Immunity',
      'Heroic Inspiration']);
    this.packages.set('Melee', ['Melee Alacrity', 'Melee Power', 'Doublestrike', 'Deadly', 'Accuracy', 'Armor-Piercing', 'Armor Class']);
    this.packages.set('Ranged', ['Ranged Alacrity', 'Ranged Power', 'Doubleshot', 'Deadly', 'Accuracy', 'Armor-Piercing']);
    this.packages.set('Caster', ['Spellcraft', 'Wizardry', 'Spell Penetration']);
    this.packages.set('Trapping', ['Open Lock', 'Disable Device', 'Spot', 'Search']);
    this.packageKeys = Array.from(this.packages.keys());

    this.spellpowerPackages.set('Healing', ['Devotion', 'Healing Lore', 'Heal', 'Healing Intensity']);
    this.spellpowerPackages.set('Kinetic', ['Impulse', 'Kinetic Lore', 'Kinetic Intensity']);
    this.spellpowerPackages.set('Fire', ['Combustion', 'Fire Lore', 'Fire Intensity']);
    this.spellpowerPackages.set('Cold', ['Glaciation', 'Ice Lore', 'Ice Intensity']);
    this.spellpowerPackages.set('Electric', ['Magnetism', 'Lightning Lore', 'Lightning Intensity']);
    this.spellpowerPackages.set('Acid', ['Corrosion', 'Acid Lore', 'Acid Intensity']);
    this.spellpowerPackages.set('Poison', ['Poison Spell Power', 'Poison Lore', 'Void Intensity']);
    this.spellpowerPackages.set('Negative', ['Nullification', 'Void Lore', 'Void Intensity']);
    this.spellpowerPackages.set('Light & Alignment', ['Radiance', 'Radiance Lore', 'Radiance Intensity']);
    this.spellpowerPackages.set('Repair', ['Repair Spell Power', 'Rust Spell Power', 'Repair Lore', 'Repair Intensity', 'Repair']);
    this.spellpowerPackages.set('Sonic', ['Resonance', 'Sonic Lore', 'Perform', 'Sonic Intensity']);
    this.spellpowerPackageKeys = Array.from(this.spellpowerPackages.keys());
    this.canonicalizePackages();
  }

  private canonicalizePackages() {
    this.packages = this.canonicalizePackageMap(this.packages);
    this.spellpowerPackages = this.canonicalizePackageMap(this.spellpowerPackages);
  }

  private canonicalizePackageMap(source: Map<string, Array<string>>) {
    const canonicalized = new Map<string, Array<string>>();
    for (const [key, affixes] of source.entries()) {
      const canonicalAffixes: string[] = [];
      for (const affix of affixes) {
        const canonicalName = this.affixSvc.getCanonicalName(affix);
        if (!canonicalAffixes.includes(canonicalName)) {
          canonicalAffixes.push(canonicalName);
        }
      }
      canonicalized.set(key, canonicalAffixes);
    }
    return canonicalized;
  }

  getBtnSize(result: string) {
    const sortedResults = Array.from(this.workingMap.entries()).sort((a, b) => b[1] - a[1]);
    if (!sortedResults.length) {
      return 'btn';
    }
    const maxVal = sortedResults[0][1];
    const myVal = this.workingMap.get(result);
    if (myVal === undefined || myVal < maxVal / 3) {
      return 'btn-sm';
    } else if (myVal > 2 / 3 * maxVal) {
      return 'btn-lg';
    } else {
      return 'btn';
    }
  }

  addPackage(pkg: string) {
    this.analytics.track('select_affix_package', {
      package_type: 'basic',
      package_name: pkg
    });
    if (pkg == 'Melee') {
      this.showTactics = true;
    } else if (pkg == 'Caster') {
      this.showSpellSchools = true;
      this.showSpellpowers = true;
    }
    const packageAffixes = this.packages.get(pkg);
    if (packageAffixes) {
      for (const affix of packageAffixes) {
        this.add(affix, 'package', false);
      }
    }
  }

  addTactic(tactic: string) {
    this.add(tactic, 'tactic_button');
  }

  addSpellSchool(spellSchool: string) {
    this.add(spellSchool + ' Focus', 'spell_school_button');
  }

  addSpellpower(spellpower: string) {
    this.analytics.track('select_affix_package', {
      package_type: 'spellpower',
      package_name: spellpower
    });
    const spellpowerAffixes = this.spellpowerPackages.get(spellpower);
    if (spellpowerAffixes) {
      for (const affix of spellpowerAffixes) {
        this.add(affix, 'spellpower_package', false);
      }
    }
  }

  add(affix: string, source: string = 'manual_search', track: boolean = true) {
    const addedAffixes = this.equipped.addImportantAffix(affix);
    if (track && addedAffixes.length) {
      this.analytics.track('select_affix', {
        selection_source: source,
        added_affix_count: addedAffixes.length
      });
    }
    for (const addedAffix of addedAffixes) {
      this.savedSet.add(addedAffix);
    }
    if (!addedAffixes.length && this.equipped.isImportantAffix(affix)) {
      this.savedSet.add(affix);
    }

    this.addAffixToWorkingMap(affix);
    for (const addedAffix of addedAffixes) {
      if (addedAffix !== affix) {
        this.addAffixToWorkingMap(addedAffix);
      }
    }
    this.refreshTopResults();
  }

  private addAffixToWorkingMap(affix: string) {
    const map = this.cloud.get(affix);
    if (!map) {
      console.log('Couldn\'t find ' + affix + ' in affix cloud');
      return;
    }

    this.workingMap = this.cloud.merge(this.workingMap, map);
  }

  private refreshTopResults() {
    for (const entry of this.workingMap) {
      if (this.savedSet.has(entry[0]) || this.ignoredSet.has(entry[0]) || this.attributes.includes(entry[0])) {
        this.workingMap.delete(entry[0]);
      }
    }

    this.topResults = Array.from(this.workingMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }

  private syncFromImportantAffixes(affixes: Set<string>) {
    this.savedSet = new Set(affixes);
    this.workingMap.clear();

    for (const savedAffix of this.savedSet) {
      this.addAffixToWorkingMap(savedAffix);
    }

    if (!this.savedSet.size) {
      this.showTactics = false;
      this.showSpellpowers = false;
      this.showSpellSchools = false;
    }

    this.refreshTopResults();
  }

  remove(affix: string) {
    const removedAffixes = this.equipped.removeImportantAffix(affix);
    for (const removedAffix of removedAffixes) {
      this.savedSet.delete(removedAffix);
    }

    this.workingMap.clear();
    for (const savedAffix of this.savedSet) {
      this.addAffixToWorkingMap(savedAffix);
    }
    this.refreshTopResults();
  }

  onChange() {
    return (affix: any) => {
      this.add(affix.original ? affix.original : affix.name, 'manual_search');
    };
  }

  getSavedAffixGroups(): AffixGroupDisplay[] {
    return groupAffixNames(this.savedSet, '', this.affixSvc, affixName => {
      const types = this.gearDB.getTypesForAffix(affixName);
      return types.length === 1 && types[0] === 'Bool' ? UTILITY_CHECKLIST_CATEGORY : null;
    });
  }
}
