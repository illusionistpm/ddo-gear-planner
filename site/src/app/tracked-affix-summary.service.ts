import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { EquippedService } from './equipped.service';
import { GearDbService } from './gear-db.service';
import { AffixService } from './affix.service';
import { TrackedAffixDerivationService } from './tracked-affix-derivation.service';
import {
  buildTrackedAffixGroups,
  classForBonusValue,
  splitCoveredAffixes,
  TrackedBonusTypeDisplay,
} from './tracked-affix-derivation';

export interface SummaryBonusBadge {
  label: string;
  code: string;
  value: number;
  maxValue: number;
  qualityClass: string;
  tooltip: string;
  ignored: boolean;
  sourceAffixName: string;
  sourceBonusType: string;
}

export interface SummaryAffix {
  name: string;
  isChecklist: boolean;
  checked: boolean;
  badges: SummaryBonusBadge[];
  currentTotal: number;
  maxTotal: number;
}

export interface SummaryGroup {
  name: string;
  affixes: SummaryAffix[];
  count: number;
}

/**
 * Produces a compact, grouped view of the tracked ("important") affixes and how
 * well the equipped gear covers each bonus type. Uses the same bonus-type
 * derivation (TrackedAffixDerivationService) as the full Tracked Affixes table
 * so the compact equipment-tab sidebar stays in agreement with it.
 */
@Injectable({
  providedIn: 'root'
})
export class TrackedAffixSummaryService {
  private static readonly BONUS_TYPE_CODES: Record<string, string> = {
    'Equipment': 'Eq',
    'Enhancement': 'En',
    'Insight': 'Ins',
    'Quality': 'Ql',
    'Exceptional': 'Ex',
    'Artifact': 'Art',
    'Profane': 'Prf',
    'Sacred': 'Sac',
    'Competence': 'Cmp',
    'Resistance': 'Res',
    'Deflection': 'Dfl',
    'Determination': 'Det',
    'Natural': 'Nat',
    'Luck': 'Lck',
    'Legendary': 'Leg',
    'Epic': 'Epc',
    'Alchemical': 'Alc',
    'Primal': 'Prm',
    'Vitality': 'Vit',
    'Psionic': 'Psi',
    'Adamantine': 'Adm',
    'Armor': 'Arm',
    'Shield': 'Shl',
    'Implement': 'Imp',
    'Orb': 'Orb',
    'Penalty': 'Pen',
    'Chaotic': 'Cha',
    'Lawful': 'Law',
    'Evil': 'Evl',
    'Good': 'Gd',
    'Piercing': 'Prc',
    'Slashing': 'Sls',
    'Bludgeoning': 'Bld',
    'Sneak Attack': 'SnA',
  };

  constructor(
    private equipped: EquippedService,
    private gearDB: GearDbService,
    private affixSvc: AffixService,
    private derivation: TrackedAffixDerivationService
  ) {}

  getSummaryGroups(): Observable<SummaryGroup[]> {
    return this.equipped.getCoveredAffixes().pipe(map(covered => this.buildGroups(covered)));
  }

  private buildGroups(covered: Map<string, Array<any>>): SummaryGroup[] {
    const { affixMap, affixNames, boolAffixMap, boolAffixNames } = splitCoveredAffixes(covered);
    boolAffixNames.sort((left, right) => left.localeCompare(right));

    const groups = buildTrackedAffixGroups(affixNames, boolAffixNames, this.affixSvc);

    return groups
      .map(group => {
        const affixes: SummaryAffix[] = [];

        for (const affixName of group.checklistAffixes) {
          const boolAffix = boolAffixMap.get(affixName)?.[0];
          if (!boolAffix || boolAffix.bonusType === 'Penalty') {
            continue;
          }
          const checklistIgnored = !boolAffix.value && this.equipped.isAffixTypeIgnored(affixName, boolAffix.bonusType);
          affixes.push({
            name: affixName,
            isChecklist: true,
            checked: !!boolAffix.value,
            badges: [{
              label: 'Checklist',
              code: boolAffix.value ? '✓' : '–',
              value: boolAffix.value ? 1 : 0,
              maxValue: 1,
              qualityClass: checklistIgnored ? 'ignored-value' : (boolAffix.value ? 'max-value' : 'no-value'),
              tooltip: checklistIgnored ? `${affixName}: marked as ignored` : (boolAffix.value ? `${affixName}: covered` : `${affixName}: not covered`),
              ignored: checklistIgnored,
              sourceAffixName: affixName,
              sourceBonusType: boolAffix.bonusType
            }],
            currentTotal: boolAffix.value ? 1 : 0,
            maxTotal: 1
          });
        }

        for (const affixName of group.affixes) {
          const types = this.derivation.getVisibleTypes(affixMap, affixName);
          const badges = types.map(type => this.makeBadge(type));
          affixes.push({
            name: affixName,
            isChecklist: false,
            checked: false,
            badges,
            currentTotal: badges.reduce((total, badge) => total + badge.value, 0),
            maxTotal: badges.reduce((total, badge) => total + Math.max(0, badge.maxValue), 0)
          });
        }

        return { name: group.name, affixes, count: affixes.length };
      })
      .filter(group => group.count > 0);
  }

  private makeBadge(type: TrackedBonusTypeDisplay): SummaryBonusBadge {
    const maxValue = this.gearDB.getBestValueForAffixType(type.sourceAffixName, type.sourceBonusType);
    const ignored = this.equipped.isAffixTypeIgnored(type.sourceAffixName, type.sourceBonusType);
    return {
      label: type.label,
      code: this.abbreviateBonusType(type.label),
      value: type.value,
      maxValue,
      qualityClass: ignored ? 'ignored-value' : classForBonusValue(type.bonusType, type.value, maxValue),
      tooltip: ignored ? `${type.label}: marked as ignored` : this.getBadgeTooltip(type, maxValue),
      ignored,
      sourceAffixName: type.sourceAffixName,
      sourceBonusType: type.sourceBonusType
    };
  }

  /**
   * A short, human-recognisable code for a bonus type, e.g. "Equipment" -> "Eq",
   * "Insight" -> "Ins", "Universal Enhancement" -> "uEn", "Artifact Natural" ->
   * "ArtN". Common DDO bonus types get a curated code; anything unrecognised
   * falls back to the leading letters of each word.
   */
  abbreviateBonusType(label: string): string {
    if (!label) {
      return 'Un';
    }

    let prefix = '';
    let rest = label;
    if (rest.startsWith('Universal ')) {
      prefix = 'u';
      rest = rest.slice('Universal '.length);
    }

    if (rest === '-' || rest === 'Untyped' || rest === '') {
      return prefix + 'Un';
    }

    const curated = TrackedAffixSummaryService.BONUS_TYPE_CODES[rest];
    if (curated) {
      return prefix + curated;
    }

    const words = rest.split(/\s+/).filter(Boolean);
    const shorten = (word: string) => word.length <= 3 ? word : word[0].toUpperCase() + word.slice(1, 3).toLowerCase();
    if (words.length === 1) {
      return prefix + shorten(words[0]);
    }
    return prefix + shorten(words[0]) + words.slice(1).map(word => word[0].toUpperCase()).join('');
  }

  private getBadgeTooltip(type: TrackedBonusTypeDisplay, maxValue: number): string {
    if (type.bonusType === 'Penalty') {
      return `${type.label}: penalty`;
    }
    if (maxValue <= 0) {
      return `${type.label}: no gear available in the current level range`;
    }
    // Match the "current/max" convention used on the Tracked Affixes page
    // (e.g. "0/30") instead of a "+N" / "none" style unique to this tooltip.
    return `${type.label}: ${type.value || 0}/${maxValue}`;
  }
}
