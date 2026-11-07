import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { AffixBuilderDrawerService, AffixBuilderOpenSource } from '../affix-builder-drawer/affix-builder-drawer.service';
import { AffixPackagesService, RECOMMENDED_PACKAGE } from '../affixes/affix-packages.service';
import { AnalyticsService } from '../shared/analytics.service';

/**
 * The way in for a build that tracks nothing yet. The planner opens straight
 * onto the gear, so this - not a setup screen in the way - is what points a
 * newcomer at the affix builder. Its hosts show it only while nothing is
 * chosen, so it goes away for good the moment anything is.
 *
 * - `card`: the Tracked Affixes panel's empty state, with one-click starter
 *   packages. Beside the gear in the side-by-side layout.
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
export class AffixStartPromptComponent {
  @Input() variant: 'card' | 'banner' = 'card';

  readonly recommendedPackage = RECOMMENDED_PACKAGE;
  readonly packageKeys: string[];

  constructor(
    private affixBuilder: AffixBuilderDrawerService,
    private affixPackages: AffixPackagesService,
    private analytics: AnalyticsService
  ) {
    this.packageKeys = affixPackages.packageKeys;
  }

  chooseAffixes() {
    const source: AffixBuilderOpenSource = this.variant === 'card' ? 'empty_state' : 'equipment_callout';
    this.analytics.track('open_affix_builder', { source });
    this.affixBuilder.open();
  }

  quickAdd(pkg: string) {
    this.analytics.track('select_affix_package', {
      package_type: 'basic',
      package_name: pkg,
      selection_source: 'start_prompt'
    });
    this.affixPackages.addPackage(pkg);
  }

  packageTooltip(pkg: string) {
    const affixes = this.affixPackages.packages.get(pkg) ?? [];
    return affixes.length ? 'Adds: ' + affixes.join(', ') : '';
  }
}
