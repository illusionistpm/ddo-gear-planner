import { Injectable } from '@angular/core';

import { AffixPackagesService } from '../affixes/affix-packages.service';
import { CurrentBuildService } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { NewBuildAnswers, TRANCE_LABEL, emptyAnswers, levelRangeOf, planFromAnswers } from './new-build-plan';

const ANSWERS_KEY = 'ddo-gear-planner-new-build-answers';
const PREFERS_PLANNER_KEY = 'ddo-gear-planner-open-planner-directly';

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

  /** Whether this viewer asked for a bare "/" to open the planner rather than the start page. */
  prefersPlanner(): boolean {
    try {
      return localStorage.getItem(PREFERS_PLANNER_KEY) === '1';
    } catch {
      return false;
    }
  }

  setPrefersPlanner(prefers: boolean): void {
    try {
      if (prefers) {
        localStorage.setItem(PREFERS_PLANNER_KEY, '1');
      } else {
        localStorage.removeItem(PREFERS_PLANNER_KEY);
      }
    } catch {
      // A per-browser convenience: without storage, the start page shows each time.
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
      // First, so the trance default reads the best Deadly at these levels.
      this.filters.setLevelRange(min, max);
      const plan = planFromAnswers(answers, {
        packages: this.affixPackages.packages,
        spellpowerPackages: this.affixPackages.spellpowerPackages,
        maxLevel,
        bestCompetenceDeadly: this.gearDB.getBestValueForAffixType('Deadly', 'Competence')
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

  /** The Insight Deadly a partial trance defaults to at the answers' levels. */
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
