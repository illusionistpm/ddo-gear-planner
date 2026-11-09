import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService } from '../planner/equipped.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { SetBonusThreshold } from '../gear/gear-db.service';
import { FILIGREE_HOSTS, FiligreeHost } from '../gear/filigree';
import { Affix } from '../affixes/affix';
import { AffixUiService } from '../affixes/affix-ui.service';
import { AnalyticsService } from '../shared/analytics.service';
import { describeFiligreeAffixes, filigreeShortName } from '../filigree-slots/filigree-text';

export interface FiligreeSetPiece {
  name: string;
  /** The short name, or the full one for a raid filigree that is in another set too. */
  label: string;
  affixText: string;
  /** What a rare copy adds; '' when nothing. */
  rareText: string;
  /** Copies slotted now, weapon and artifact together. */
  slotted: number;
}

/**
 * A filigree set's bonuses and pieces, each piece with buttons that add it to the weapon or the
 * artifact. Shown in the drawer (from the gear list's set card) and beside the bonus-type drawer.
 */
@Component({
  selector: 'app-filigree-set-details',
  templateUrl: './filigree-set-details.component.html',
  styleUrls: ['./filigree-set-details.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class FiligreeSetDetailsComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) setName!: string;
  /** A piece to mark, as the one the player came from. */
  @Input() highlightFiligree: string | null = null;

  readonly hosts = FILIGREE_HOSTS;
  tiers: SetBonusThreshold[] = [];
  pieces: FiligreeSetPiece[] = [];
  slottedPieces = 0;

  private subscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    public affixUi: AffixUiService,
    private filigreeDb: FiligreeDbService,
    private analytics: AnalyticsService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.subscription = this.equipped.getFiligreeLoadoutObservable().subscribe(() => this.refresh());
  }

  ngOnChanges() {
    this.refresh();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  hostLabel(host: FiligreeHost): string {
    return host === 'weapon' ? 'Weapon' : 'Artifact';
  }

  /** Why the piece can't be added to the host, or '' when it can. */
  blocker(host: FiligreeHost, name: string): string {
    return this.equipped.getFiligreeAppendBlocker(host, name, true);
  }

  buttonTitle(host: FiligreeHost, name: string): string {
    const blocker = this.blocker(host, name);
    if (blocker) {
      return blocker;
    }
    // A second copy still counts toward the set.
    return this.equipped.getShownFiligree(host).some(choice => choice.name === name)
      ? `Adds a set piece only: already in the ${host === 'weapon' ? 'weapon' : 'artifact'}`
      : `Add it after the filigrees already in the ${host === 'weapon' ? 'weapon' : 'artifact'}`;
  }

  add(host: FiligreeHost, name: string) {
    if (this.blocker(host, name) || !this.equipped.appendFiligree(host, { name, rare: false })) {
      return;
    }
    this.analytics.track('slot_filigree_from_set', { host });
  }

  tierTooltip(tier: SetBonusThreshold): string {
    return tier.eligible
      ? `Active — ${tier.threshold} of ${this.setName} slotted`
      : this.affixUi.getSetBonusLockedTooltip(tier.threshold, this.slottedPieces);
  }

  private refresh() {
    if (!this.setName) {
      return;
    }
    this.slottedPieces = this.equipped.getFiligreeSetPieces().get(this.setName) ?? 0;
    this.tiers = this.filigreeDb.getSetTiers(this.setName, this.slottedPieces);
    const slotted = new Map<string, number>();
    for (const entry of this.equipped.getCountedFiligree()) {
      slotted.set(entry.choice.name, (slotted.get(entry.choice.name) ?? 0) + 1);
    }
    this.pieces = this.filigreeDb.getFiligreesInSet(this.setName).map(name => {
      const rare = (this.filigreeDb.get(name)?.rareAffixes ?? []).map(affix => new Affix(affix));
      return {
        name,
        label: this.filigreeDb.getSets(name).length > 1 ? name : filigreeShortName(name),
        affixText: describeFiligreeAffixes(this.filigreeDb.getAffixes({ name, rare: false })),
        rareText: describeFiligreeAffixes(rare),
        slotted: slotted.get(name) ?? 0,
      };
    });
    this.changeDetector.markForCheck();
  }
}
