import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { FiligreeLoadoutService } from '../planner/filigree-loadout.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { SetBonusThreshold } from '../gear/gear-db.service';
import { FILIGREE_HOST_TEXT, FILIGREE_HOSTS, FiligreeHost } from '../gear/filigree';
import { AnalyticsService } from '../shared/analytics.service';
import { describeFiligreeAffixes, filigreeShortName } from '../gear/filigree-text';

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

/** One set's bonuses, as shown: a raid filigree's panel has one for each of its two sets. */
export interface FiligreeSetSection {
  name: string;
  /** Pieces of it slotted now. */
  slotted: number;
  tiers: SetBonusThreshold[];
}

/** Pieces under one heading: in a panel of two sets, those in both, then each set's own. */
export interface FiligreeSetPieceGroup {
  /** null in a panel of one set, which needs no heading. */
  title: string | null;
  pieces: FiligreeSetPiece[];
}

/**
 * A filigree set's bonuses and pieces, each piece with buttons that add it to the weapon or the
 * artifact. Shown in the drawer (from the gear list's set card) and beside the bonus-type drawer.
 * Given a raid filigree's two sets, it shows both: each set's bonuses under its name, then the
 * pieces in both sets, then each set's own.
 */
@Component({
  selector: 'app-filigree-set-details',
  templateUrl: './filigree-set-details.component.html',
  styleUrls: ['./filigree-set-details.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class FiligreeSetDetailsComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) setNames!: ReadonlyArray<string>;
  /** A piece to mark, as the one the player came from. */
  @Input() highlightFiligree: string | null = null;

  readonly hosts = FILIGREE_HOSTS;
  readonly hostText = FILIGREE_HOST_TEXT;
  sections: FiligreeSetSection[] = [];
  pieceGroups: FiligreeSetPieceGroup[] = [];

  private subscription?: Subscription;

  constructor(
    public filigree: FiligreeLoadoutService,
    private filigreeDb: FiligreeDbService,
    private analytics: AnalyticsService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.subscription = this.filigree.getLoadoutObservable().subscribe(() => this.refresh());
  }

  ngOnChanges() {
    this.refresh();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  add(host: FiligreeHost, name: string) {
    // As in the bonus-type drawer, not twice into one host.
    if (this.filigree.getAppendBlocker(host, name) || !this.filigree.append(host, { name, rare: false })) {
      return;
    }
    this.analytics.track('slot_filigree_from_set', { host });
  }

  private refresh() {
    if (!this.setNames?.length) {
      return;
    }
    const setPieces = this.filigree.getSetPieces();
    this.sections = this.setNames.map(name => {
      const slotted = setPieces.get(name) ?? 0;
      return { name, slotted, tiers: this.filigreeDb.getSetTiers(name, slotted) };
    });

    const slotted = new Map<string, number>();
    for (const entry of this.filigree.getCounted()) {
      slotted.set(entry.choice.name, (slotted.get(entry.choice.name) ?? 0) + 1);
    }
    const piece = (name: string, label: string): FiligreeSetPiece => ({
      name,
      label,
      affixText: describeFiligreeAffixes(this.filigreeDb.getAffixes({ name, rare: false })),
      rareText: describeFiligreeAffixes(this.filigreeDb.getRareAffixes(name)),
      slotted: slotted.get(name) ?? 0,
    });
    // A raid filigree is named for its two sets, so it keeps its full name except under a heading
    // that already says both.
    const ownLabel = (name: string) => this.filigreeDb.getSets(name).length > 1 ? name : filigreeShortName(name);

    if (this.setNames.length === 1) {
      const names = this.filigreeDb.getFiligreesInSet(this.setNames[0]);
      this.pieceGroups = [{ title: null, pieces: names.map(name => piece(name, ownLabel(name))) }];
    } else {
      const inAll = (name: string) => this.setNames.every(set => this.filigreeDb.getSets(name).includes(set));
      const shared = this.filigreeDb.getFiligreesInSet(this.setNames[0]).filter(inAll);
      this.pieceGroups = [
        { title: 'Both sets', pieces: shared.map(name => piece(name, filigreeShortName(name))) },
        ...this.setNames.map(set => ({
          title: set,
          pieces: this.filigreeDb.getFiligreesInSet(set).filter(name => !inAll(name)).map(name => piece(name, ownLabel(name))),
        })),
      ].filter(group => group.pieces.length);
    }
    this.changeDetector.markForCheck();
  }
}
