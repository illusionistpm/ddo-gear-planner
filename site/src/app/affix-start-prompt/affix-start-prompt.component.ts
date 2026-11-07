import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixBuilderDrawerService, AffixBuilderOpenSource } from '../affix-builder-drawer/affix-builder-drawer.service';
import { AffixPackagesService, DEFAULT_PACKAGE } from '../affixes/affix-packages.service';
import { EquippedService } from '../planner/equipped.service';
import { AnalyticsService } from '../shared/analytics.service';

/** A focus whose follow-up choice (which spell power) only the affix builder offers. */
const FOCUS_NEEDING_BUILDER = 'Caster';

/**
 * The way in for a build that hasn't chosen a focus yet. The planner opens
 * straight onto the gear, tracking Basic, so this - not a setup screen in the
 * way - is what asks a newcomer what the build is for. Its hosts show it only
 * while AffixPackagesService.needsStart() holds, so it goes away for good the
 * moment a focus (or anything else beyond Basic) is chosen.
 *
 * - `card`: the Tracked Affixes panel's start state: Basic as a chip that is
 *   already on, and one click per focus. Beside the gear in the side-by-side layout.
 * - `banner`: one line over the equipment, for the tabbed layout, where the
 *   affixes panel (and its card) is out of sight.
 */
@Component({
  selector: 'app-affix-start-prompt',
  templateUrl: './affix-start-prompt.component.html',
  styleUrls: ['./affix-start-prompt.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AffixStartPromptComponent implements OnInit, OnDestroy {
  @Input() variant: 'card' | 'banner' = 'card';

  readonly defaultPackage = DEFAULT_PACKAGE;
  readonly focusKeys: string[];
  readonly focusNeedingBuilder = FOCUS_NEEDING_BUILDER;
  defaultSelected = false;

  private subscription?: Subscription;

  constructor(
    private affixBuilder: AffixBuilderDrawerService,
    private affixPackages: AffixPackagesService,
    private equipped: EquippedService,
    private analytics: AnalyticsService
  ) {
    this.focusKeys = affixPackages.packageKeys.filter(pkg => pkg !== DEFAULT_PACKAGE);
  }

  ngOnInit() {
    this.subscription = this.equipped.getImportantAffixesObservable().subscribe(tracked => {
      this.defaultSelected = this.affixPackages.isSelected(this.affixPackages.packages.get(DEFAULT_PACKAGE), tracked);
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  chooseAffixes() {
    this.openBuilder(this.variant === 'card' ? 'empty_state' : 'equipment_callout');
  }

  toggleDefault() {
    if (this.defaultSelected) {
      this.affixPackages.removePackage(DEFAULT_PACKAGE);
      return;
    }
    this.trackPackage(DEFAULT_PACKAGE);
    this.affixPackages.addPackage(DEFAULT_PACKAGE);
  }

  chooseFocus(pkg: string) {
    this.trackPackage(pkg);
    this.affixPackages.addPackage(pkg);
    if (pkg === FOCUS_NEEDING_BUILDER) {
      this.openBuilder('empty_state');
    }
  }

  packageTooltip(pkg: string) {
    const affixes = this.affixPackages.packages.get(pkg) ?? [];
    return affixes.length ? 'Adds: ' + affixes.join(', ') : '';
  }

  private openBuilder(source: AffixBuilderOpenSource) {
    this.analytics.track('open_affix_builder', { source });
    this.affixBuilder.open();
  }

  private trackPackage(pkg: string) {
    this.analytics.track('select_affix_package', {
      package_type: 'basic',
      package_name: pkg,
      selection_source: 'start_prompt'
    });
  }
}
