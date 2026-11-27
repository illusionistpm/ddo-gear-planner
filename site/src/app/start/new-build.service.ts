import { Injectable } from '@angular/core';

import { AffixPackagesService } from '../affixes/affix-packages.service';
import { CurrentBuildService } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { NEW_BUILD_ANSWERS_KEY } from './start-new-build';
import { NewBuildAnswers, TRANCE_LABEL, emptyAnswers, levelRangeOf, planFromAnswers } from './new-build-plan';

const ANSWERS_KEY = NEW_BUILD_ANSWERS_KEY;
const PREFERS_PLANNER_KEY = 'ddo-gear-planner-open-planner-directly';
const PACKS_KEY = 'ddo-gear-planner-new-build-packs';

/**
 * The start page's link to the planner: it sets a new build up from the
 * guided setup's answers, in the planner's own services but with the URL
 * held at /start (QueryParamsService.holdingUrl), then hands it over.
 * The answers live in sessionStorage, so a reload or Back from the planner
 * brings the setup back as it was.
 */
@Injectable({
  providedIn: 'root'
})
export class NewBuildService {
  private handedOff = false;

  constructor(
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly filters: FiltersService,
    private readonly gearDB: GearDbService,
    private readonly affixPackages: AffixPackagesService,
    private readonly currentBuild: CurrentBuildService,
    private readonly onboarding: PlannerOnboardingService
  ) { }


  /**
   * Whether a bare "/" should open the planner rather than the start page. The app offers
   * no setting for it: it's for tools/visual-diff/capture.py, whose empty-build scenes are
   * the planner's.
   */
  prefersPlanner(): boolean {
    try {
      return localStorage.getItem(PREFERS_PLANNER_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * The packs this browser's last setup hid, for the next one to start from:
   * players own the same packs whatever they build. Null when it showed every pack.
   */
  rememberedPacks(): string[] | null {
    try {
      const parsed = JSON.parse(localStorage.getItem(PACKS_KEY) ?? 'null');
      return Array.isArray(parsed) && parsed.length && parsed.every(pack => typeof pack === 'string') ? parsed : null;
    } catch {
      return null;
    }
  }

  rememberPacks(hidden: ReadonlyArray<string>): void {
    try {
      if (hidden.length) {
        localStorage.setItem(PACKS_KEY, JSON.stringify(hidden));
      } else {
        localStorage.removeItem(PACKS_KEY);
      }
    } catch {
      // The next setup starts on every pack.
    }
  }

  loadAnswers(): NewBuildAnswers | null {
    try {
      const raw = sessionStorage.getItem(ANSWERS_KEY);
      return raw ? { ...emptyAnswers(), ...JSON.parse(raw) } : null;
    } catch {
      return null;
    }
  }

  saveAnswers(answers: NewBuildAnswers): void {
    try {
      sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    } catch {
      // Only a reload's memory of the form is lost.
    }
  }

  clearAnswers(): void {
    try {
      sessionStorage.removeItem(ANSWERS_KEY);
    } catch {
      // Nothing to clear.
    }
  }

  /** Empties the planner for a new build, as a bare "/" would, keeping the URL where it is. */
  startFresh(): void {
    this.currentBuild.reset();
    this.queryParams.applyDecodedBuildParams({});
    this.currentBuild.acceptCurrentAsBaseline();
  }

  /** Makes the planner's build what the answers say: goals, levels, item types and trance. */
  apply(answers: NewBuildAnswers): void {
    this.queryParams.holdingUrl(() => {
      const maxLevel = this.filters.getMaxLevel();
      const [min, max] = levelRangeOf(answers, maxLevel);
      this.filters.setLevelRange(min, max);
      this.filters.setShowRaidItems(answers.showRaid);
      this.filters.setShowRareItems(answers.showRare);
      this.filters.setHiddenPacks(new Set(answers.hiddenPacks));
      const plan = planFromAnswers(answers, {
        packages: this.affixPackages.packages,
        spellpowerPackages: this.affixPackages.spellpowerPackages,
        maxLevel,
        bestCompetenceDeadly: this.bestCompetenceDeadly()
      });
      this.filters.setHiddenTypes(plan.hiddenTypes);
      this.equipped.setImportantAffixes(plan.tracked);
      for (const entry of this.equipped.getExternalAffixesSnapshot()) {
        if (entry.label === TRANCE_LABEL) {
          this.equipped.removeExternalAffix(entry.id);
        }
      }
      for (const external of plan.externals) {
        if (external.value === null) {
          this.equipped.addExternalAffixIgnored(external.affixName, external.bonusType, TRANCE_LABEL);
        } else {
          this.equipped.addExternalAffixValue(external.affixName, external.bonusType, external.value, TRANCE_LABEL);
        }
      }
    });
  }

  /** The best Competence Deadly on gear at the filters' levels, which a trance's estimate starts from. */
  bestCompetenceDeadly(): number {
    return this.gearDB.getBestValueForAffixType('Deadly', 'Competence');
  }

  /**
   * Opens the build in the planner, on the gear, with the intro's wrap-up to
   * follow. Its first URL: one pushed entry, so Back returns to the setup.
   */
  handOff(): Promise<boolean> {
    // What the setup made is the build's starting point, as Basic is for a
    // blank one: Back to the setup straight away loses nothing, so nothing asks.
    this.currentBuild.acceptCurrentAsBaseline();
    this.onboarding.completeIntro();
    this.handedOff = true;
    return this.queryParams.navigateToBuild();
  }

  /** True once, for the planner arriving from handOff: it opens on the gear, not the goals editor. */
  consumeHandOff(): boolean {
    const handedOff = this.handedOff;
    this.handedOff = false;
    return handedOff;
  }
}
