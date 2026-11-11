import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { AffixUiService } from '../affixes/affix-ui.service';
import { SetBonusThreshold } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';

/**
 * A set's bonuses, tier by tier, each affix with a heart to track it and its value ranked against
 * the build; tiers not yet reached are dimmed. Used for gear sets (items-in-set) and filigree sets.
 */
@Component({
  selector: 'app-set-bonus-summary',
  templateUrl: './set-bonus-summary.component.html',
  styleUrls: ['./set-bonus-summary.component.css'],
  // Hearts and ranks follow the tracked affixes and the equipped build, which no input reflects.
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SetBonusSummaryComponent {
  @Input({ required: true }) tiers!: ReadonlyArray<SetBonusThreshold>;
  @Input({ required: true }) setName!: string;
  /** Pieces of the set the build has now. */
  @Input({ required: true }) pieces!: number;
  /** How a piece counts toward it: "equipped" for gear, "slotted" for filigree. */
  @Input() pieceVerb = 'equipped';

  constructor(public equipped: EquippedService, public affixUi: AffixUiService) { }

  tierTooltip(tier: SetBonusThreshold): string {
    return tier.eligible
      ? `Active — ${tier.threshold} of ${this.setName} ${this.pieceVerb}`
      : this.affixUi.getSetBonusLockedTooltip(tier.threshold, this.pieces);
  }
}
