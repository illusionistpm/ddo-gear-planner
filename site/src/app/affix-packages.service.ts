import { Injectable } from '@angular/core';

import { AffixService } from './affix.service';
import { EquippedService } from './equipped.service';

/** A non-gear source (see EquippedService's external affixes) that a package brings along with it. */
export interface AffixPackageExternal {
  affixName: string;
  bonusType: string;
  value: number;
  label: string;
}

const DEFAULT_PACKAGE = 'Basic';

const TRANCE_INSIGHTFUL_DEADLY: AffixPackageExternal = {
  affixName: 'Deadly',
  bonusType: 'Insightful',
  value: 10,
  label: 'Trance'
};

/**
 * The one-click affix bundles on the Edit Tracked Affixes page. A bundle isn't stored anywhere - it counts
 * as selected for as long as the tracked affixes contain everything it lists.
 */
@Injectable({
  providedIn: 'root'
})
export class AffixPackagesService {
  packages = new Map<string, Array<string>>();
  packageKeys: string[] = [];
  spellpowerPackages = new Map<string, Array<string>>();
  spellpowerPackageKeys: string[] = [];

  private externals = new Map<string, AffixPackageExternal[]>();

  constructor(
    private affixSvc: AffixService,
    private equipped: EquippedService
  ) {
    this.packages.set('Basic', ['Healing Amplification', 'Physical Sheltering',
      'Magical Sheltering', 'Constitution', 'Dodge', 'Fortitude Save', 'Reflex Save', 'Will Save', 'Blurry', 'Parrying', 'Ghostly',
      'Fortification', 'False Life', 'Speed', 'Freedom of Movement', 'Feather Falling', 'Blindness Immunity',
      'Heroic Inspiration']);
    this.packages.set('Melee', ['Melee Alacrity', 'Melee Power', 'Doublestrike', 'Deadly', 'Seeker', 'Accuracy', 'Armor-Piercing', 'Armor Class']);
    this.packages.set('Ranged', ['Ranged Alacrity', 'Ranged Power', 'Doubleshot', 'Deadly', 'Seeker', 'Accuracy', 'Armor-Piercing']);
    this.packages.set('Caster', ['Spellcraft', 'Wizardry', 'Spell Penetration', 'Concentration']);
    this.packages.set('Trapping', ['Open Lock', 'Disable Device', 'Spot', 'Search']);
    this.packageKeys = Array.from(this.packages.keys());

    this.externals.set('Melee', [TRANCE_INSIGHTFUL_DEADLY]);
    this.externals.set('Ranged', [TRANCE_INSIGHTFUL_DEADLY]);

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

    this.packages = this.canonicalizePackageMap(this.packages);
    this.spellpowerPackages = this.canonicalizePackageMap(this.spellpowerPackages);
  }

  isSelected(affixes: string[] | undefined, tracked: ReadonlySet<string>): boolean {
    return !!affixes && affixes.length > 0 && affixes.every(affix => tracked.has(affix));
  }

  addPackage(pkg: string) {
    this.addFrom(this.packages, pkg);
  }

  addSpellpower(spellpower: string) {
    this.addFrom(this.spellpowerPackages, spellpower);
  }

  removePackage(pkg: string) {
    this.removeFrom(this.packages, pkg);
  }

  removeSpellpower(spellpower: string) {
    this.removeFrom(this.spellpowerPackages, spellpower);
  }

  /** What a visitor with nothing tracked yet starts out with. */
  addDefaultPackage() {
    if (!this.equipped.getImportantAffixes().size) {
      this.addPackage(DEFAULT_PACKAGE);
    }
  }

  private addFrom(source: Map<string, Array<string>>, key: string) {
    this.equipped.addImportantAffixes(source.get(key) ?? []);

    for (const external of this.externals.get(key) ?? []) {
      // A value the user already entered (or chose to ignore) for this slot wins over the suggestion.
      if (!this.equipped.getExternalAffixesForType(external.affixName, external.bonusType).length) {
        this.equipped.addExternalAffixValue(external.affixName, external.bonusType, external.value, external.label);
      }
    }
  }

  private removeFrom(source: Map<string, Array<string>>, key: string) {
    const affixes = source.get(key);
    if (!affixes) {
      return;
    }

    // Bundles overlap (Melee and Ranged both want Deadly, for one), so leave alone whatever another
    // selected bundle in the same list still needs.
    const tracked = this.equipped.getImportantAffixes();
    const stillNeeded = Array.from(source.keys())
      .filter(other => other !== key && this.isSelected(source.get(other), tracked));
    const neededAffixes = new Set(stillNeeded.flatMap(other => source.get(other)!));

    this.equipped.removeImportantAffixes(affixes.filter(affix => !neededAffixes.has(affix)));

    for (const external of this.externals.get(key) ?? []) {
      const neededElsewhere = stillNeeded.some(other => (this.externals.get(other) ?? [])
        .some(e => e.affixName === external.affixName && e.bonusType === external.bonusType));
      if (neededElsewhere) {
        continue;
      }

      // Only take back an entry that's still exactly what we added - not one the user has since changed.
      for (const entry of this.equipped.getExternalAffixesForType(external.affixName, external.bonusType)) {
        if (entry.kind === 'value' && entry.value === external.value && entry.label === external.label) {
          this.equipped.removeExternalAffix(entry.id);
        }
      }
    }
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
}
