import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { BehaviorSubject, combineLatest, fromEvent, merge, Observable, of, Subscription } from 'rxjs';
import { catchError, filter, map, switchMap, throttleTime } from 'rxjs/operators';

import { AffixSource, AffixTotal, AffixTypeTotal } from '../affixes/build-totals';
import { BuildSummary } from '../build/build';
import { buildPath, comparePath } from '../build/build-route';
import { BuildsService } from '../build/builds.service';
import { FILIGREE_HOST_TEXT } from '../gear/filigree';
import { BuildModel } from '../planner/build-snapshot';
import { AuthService } from '../shared/auth.service';
import { BuildCompareService } from '../compare/build-compare.service';
import { AffixDiffRow, BuildComparison, GearSide, SetChange } from '../compare/build-comparison';

const SITE_TITLE = 'DDO Gear Planner';
/** A refetch on coming back to the tab waits at least this long after the last. */
const REFRESH_THROTTLE_MS = 5000;

/** One side of the comparison. */
export type CompareSide =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready'; shortId: string; name: string; blob: string; model: BuildModel }
  | { status: 'error'; shortId: string; error: 'not-found' | 'invalid' | 'network' };

/** A bonus type's row in an affix's breakdown, both sides. */
export interface BreakdownRow {
  label: string;
  a: number | null;
  b: number | null;
  aFrom: string;
  bFrom: string;
  ignored: boolean;
}

export interface PickerOption {
  shortId: string;
  name: string;
}

/**
 * The compare page itself (ComparePageComponent is its header): two saved
 * builds, picked from yours or named by the URL, side by side. Standalone and
 * loaded on first visit, so nothing it uses lands in the planner's bundle.
 *
 * "Before" is the build compared against and "After" the one compared, so a
 * change reads After minus Before: the gear swap being judged.
 */
@Component({
  selector: 'app-build-compare',
  templateUrl: './build-compare.component.html',
  styleUrls: ['../shared/pill-button.css', './build-compare.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
})
export class BuildCompareComponent implements OnInit, OnChanges, OnDestroy {
  @Input() a: string | null = null;
  @Input() b: string | null = null;

  sideA: CompareSide = { status: 'empty' };
  sideB: CompareSide = { status: 'empty' };
  comparison: BuildComparison | null = null;
  signedIn = false;
  mine: PickerOption[] | null = null;
  mineError = false;
  /** Rows with no change are hidden; on by default once anything changed. */
  changesOnly = true;
  private changesOnlyChosen = false;

  private readonly ids = new BehaviorSubject<[string | null, string | null]>([null, null]);
  private readonly refresh = new BehaviorSubject<void>(undefined);
  private subscription = new Subscription();
  private comparedBlobs = '';
  private readonly breakdowns = new WeakMap<AffixDiffRow, BreakdownRow[]>();

  constructor(
    private readonly builds: BuildsService,
    private readonly compareService: BuildCompareService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly title: Title,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnChanges(): void {
    this.ids.next([this.a || null, this.b || null]);
  }

  ngOnInit(): void {
    this.subscription.add(combineLatest([this.ids, this.refresh]).pipe(
      switchMap(([[a, b]]) => combineLatest([this.side(a), this.side(b)]))
    ).subscribe(([sideA, sideB]) => this.show(sideA, sideB)));

    // Back from tweaking a build in another tab: show what was saved there.
    const visible = fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible'));
    this.subscription.add(merge(fromEvent(window, 'focus'), visible).pipe(
      throttleTime(REFRESH_THROTTLE_MS)
    ).subscribe(() => this.refresh.next()));

    this.subscription.add(this.auth.isAuthenticated$.pipe(
      switchMap(signedIn => {
        this.signedIn = signedIn;
        return signedIn ? this.builds.listMine().pipe(
          map(mine => mine as BuildSummary[] | null),
          catchError(() => of(null))
        ) : of([]);
      })
    ).subscribe(mine => {
      this.mineError = mine === null;
      this.mine = (mine ?? []).map(build => ({ shortId: build.shortId, name: build.name }));
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /** A side's build, fetched; a refetch keeps showing the build until the new answer is in. */
  private side(shortId: string | null): Observable<CompareSide> {
    if (!shortId) {
      return of({ status: 'empty' });
    }
    const current = [this.sideA, this.sideB].find(side => side.status === 'ready' && side.shortId === shortId);
    const fetched = this.builds.getByShortId(shortId).pipe(
      map(({ name, blob }): CompareSide => {
        const model = this.compareService.modelOf(blob);
        return model ? { status: 'ready', shortId, name, blob, model } : { status: 'error', shortId, error: 'invalid' };
      }),
      catchError((error: unknown) => of<CompareSide>({
        status: 'error', shortId,
        error: error instanceof HttpErrorResponse && error.status === 404 ? 'not-found' : 'network'
      }))
    );
    return current ? merge(of(current), fetched) : merge(of<CompareSide>({ status: 'loading' }), fetched);
  }

  private show(sideA: CompareSide, sideB: CompareSide): void {
    this.sideA = sideA;
    this.sideB = sideB;
    if (sideA.status === 'ready' && sideB.status === 'ready') {
      const blobs = `${sideA.blob}\n${sideB.blob}`;
      if (blobs !== this.comparedBlobs || !this.comparison) {
        this.comparedBlobs = blobs;
        this.comparison = this.compareService.compare(sideA.model, sideB.model);
        if (!this.changesOnlyChosen) {
          this.changesOnly = this.comparison.summary.higher + this.comparison.summary.lower > 0;
        }
      }
    } else if (sideA.status !== 'loading' && sideB.status !== 'loading') {
      this.comparison = null;
      this.comparedBlobs = '';
    }
    const nameA = sideA.status === 'ready' ? sideA.name : null;
    const nameB = sideB.status === 'ready' ? sideB.name : null;
    this.title.setTitle(nameA && nameB ? `Compare ${nameA} and ${nameB} - ${SITE_TITLE}` : `Compare builds - ${SITE_TITLE}`);
    this.cdr.markForCheck();
  }

  /** The builds a picker offers: yours, and whichever build it shows if that isn't one. */
  optionsFor(side: CompareSide, shortId: string | null): PickerOption[] {
    const options = this.mine ?? [];
    if (!shortId || options.some(option => option.shortId === shortId)) {
      return options;
    }
    const name = side.status === 'ready' ? side.name : shortId;
    return [{ shortId, name }, ...options];
  }

  pick(which: 'a' | 'b', shortId: string): void {
    const a = which === 'a' ? shortId : this.a;
    const b = which === 'b' ? shortId : this.b;
    this.router.navigateByUrl(comparePath(a, b));
  }

  swap(): void {
    this.router.navigateByUrl(comparePath(this.b, this.a), { replaceUrl: true });
  }

  signIn(): void {
    this.auth.signIn();
  }

  retry(): void {
    this.refresh.next();
  }

  setChangesOnly(on: boolean): void {
    this.changesOnly = on;
    this.changesOnlyChosen = true;
  }

  plannerPathOf(side: CompareSide): string | null {
    return side.status === 'ready' ? buildPath(side.shortId, side.name) : null;
  }

  get sameBuild(): boolean {
    return !!this.a && this.a === this.b;
  }

  get unknownItems(): Array<{ side: string; slot: string; name: string }> {
    const of = (label: string, side: CompareSide) => side.status === 'ready'
      ? side.model.snapshot.unknownItems.map(entry => ({ side: label, ...entry }))
      : [];
    return [...of('Before', this.sideA), ...of('After', this.sideB)];
  }

  visibleRows(rows: AffixDiffRow[]): AffixDiffRow[] {
    return this.changesOnly ? rows.filter(row => row.delta !== 0) : rows;
  }

  get visibleTrackedCount(): number {
    return (this.comparison?.tracked ?? []).reduce((count, group) => count + this.visibleRows(group.rows).length, 0);
  }

  valueText(row: AffixDiffRow, total: AffixTotal): string {
    if (row.checklist) {
      return total.total ? 'Yes' : '—';
    }
    return String(total.total);
  }

  deltaText(row: AffixDiffRow): string {
    if (row.checklist) {
      return row.delta > 0 ? 'Gained' : row.delta < 0 ? 'Lost' : '—';
    }
    return row.delta > 0 ? `+${row.delta}` : row.delta < 0 ? `−${-row.delta}` : '—';
  }

  deltaClass(delta: number): string {
    return delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  }

  trackedNote(row: AffixDiffRow): string | null {
    return row.trackedIn === 'a' ? 'tracked in Before' : row.trackedIn === 'b' ? 'tracked in After' : null;
  }

  /** The row's bonus types, both sides lined up, for its expanded breakdown. */
  breakdown(row: AffixDiffRow): BreakdownRow[] {
    let rows = this.breakdowns.get(row);
    if (!rows) {
      const byKey = new Map<string, BreakdownRow>();
      const add = (type: AffixTypeTotal, side: 'a' | 'b') => {
        const key = `${type.sourceAffixName}|${type.bonusType}`;
        const entry = byKey.get(key) ?? { label: type.label, a: null, b: null, aFrom: '', bFrom: '', ignored: false };
        entry[side] = type.value;
        entry[side === 'a' ? 'aFrom' : 'bFrom'] = type.sources.map(sourceText).join(', ');
        entry.ignored ||= type.ignored;
        byKey.set(key, entry);
      };
      row.a.types.forEach(type => add(type, 'a'));
      row.b.types.forEach(type => add(type, 'b'));
      rows = [...byKey.values()];
      this.breakdowns.set(row, rows);
    }
    return rows;
  }

  /** Before's side, then After's, as the pickers show them. */
  get sidesList(): Array<{ key: 'a' | 'b'; label: string; id: string | null; side: CompareSide }> {
    return [
      { key: 'a', label: 'Before', id: this.a, side: this.sideA },
      { key: 'b', label: 'After', id: this.b, side: this.sideB },
    ];
  }

  tierText(set: SetChange): string | null {
    const change = set.bTiers - set.aTiers;
    if (!change) {
      return null;
    }
    const count = Math.abs(change);
    return `${change > 0 ? 'Gains' : 'Loses'} ${count} bonus tier${count === 1 ? '' : 's'}`;
  }

  gearText(side: GearSide | null): string {
    return side ? side.name : 'Empty';
  }

  hostLabel(host: 'weapon' | 'artifact'): string {
    return FILIGREE_HOST_TEXT[host].label;
  }
}

function sourceText(source: AffixSource): string {
  switch (source.kind) {
    case 'item': return `${source.itemName} (${source.slot})`;
    case 'set': return `${source.itemName} (set)`;
    case 'external': return `${source.itemName} (non-gear)`;
    default: return `${source.itemName} (${source.slot.toLowerCase()})`;
  }
}
