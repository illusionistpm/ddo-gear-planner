import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { BehaviorSubject, combineLatest, fromEvent, merge, Observable, of, Subscription } from 'rxjs';
import { catchError, filter, map, switchMap, throttleTime } from 'rxjs/operators';

import { AffixSource, AffixTypeTotal } from '../affixes/build-totals';
import { sortBonusTypes } from '../affixes/tracked-affix-derivation';
import { BuildSummary } from '../build/build';
import { buildPath, comparePath } from '../build/build-route';
import { BuildsService } from '../build/builds.service';
import { FILIGREE_HOST_TEXT } from '../gear/filigree';
import { slotLabel } from '../gear/slot-display';
import { SlotIconComponent } from '../slot-icon/slot-icon.component';
import { BuildModel } from '../planner/build-snapshot';
import { AuthService } from '../shared/auth.service';
import { BuildCompareService } from '../compare/build-compare.service';
import { AffixDiffGroup, AffixDiffRow, BuildComparison, GearSide, SetChange } from '../compare/build-comparison';

const SITE_TITLE = 'DDO Gear Planner';
/** A refetch on coming back to the tab waits at least this long after the last. */
const REFRESH_THROTTLE_MS = 5000;

/** One side of the comparison. */
export type CompareSide =
  | { status: 'empty' }
  | { status: 'loading' }
  | { status: 'ready'; shortId: string; name: string; blob: string; model: BuildModel }
  | { status: 'error'; shortId: string; error: 'not-found' | 'invalid-link' | 'network' };

/** Something giving a bonus type its value, shown with its slot's icon (or a set's, non-gear's or filigree's). */
export interface BreakdownSource {
  key: string;
  name: string;
  /** Where it is: "Ring 1", "Set bonus", ... */
  title: string;
  slot?: string;
  icon?: string;
  /** The other side doesn't get this bonus type from it. */
  changed: boolean;
}

/** A bonus type's row in an affix's breakdown, both sides. */
export interface BreakdownRow {
  /** "Enhancement", "Universal Implement", or "Checklist" for an on/off affix. */
  label: string;
  bonusType: string;
  sourceAffixName: string;
  /** An on/off affix: values are 1 or 0, shown as checkboxes. */
  checklist: boolean;
  a: number | null;
  b: number | null;
  /** b minus a. */
  delta: number;
  aFrom: BreakdownSource[];
  bFrom: BreakdownSource[];
  ignored: boolean;
}

export interface PickerOption {
  shortId: string;
  name: string;
}

/** One side's picker, as the template shows it. */
export interface PickerView {
  key: 'a' | 'b';
  label: 'Before' | 'After';
  /** The build the URL names for this side. */
  id: string | null;
  side: CompareSide;
  /** The build's name, once it's here. */
  name: string | null;
  /** Its page in the planner, once it's here. */
  plannerPath: string | null;
  /** Why it couldn't be shown, if it couldn't. */
  error: Extract<CompareSide, { status: 'error' }>['error'] | null;
  /** The builds to pick from: yours, and this side's if it isn't one. */
  options: PickerOption[];
}

/** A build naming an item the game data no longer has. */
export interface UnknownItemWarning {
  side: 'Before' | 'After';
  slot: string;
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
  imports: [NgTemplateOutlet, SlotIconComponent],
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

  // Worked out when the builds, your builds or Changes only change (refreshView), not on every check.
  pickers: PickerView[] = [];
  unknownItems: UnknownItemWarning[] = [];
  /** The tracked affixes Changes only leaves, by group; groups it empties are left out. */
  visibleTracked: AffixDiffGroup[] = [];
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
    this.refreshView();
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
      this.refreshView();
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
        return model ? { status: 'ready', shortId, name, blob, model } : { status: 'error', shortId, error: 'invalid-link' };
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
    this.refreshView();
    this.cdr.markForCheck();
  }

  private refreshView(): void {
    this.pickers = [this.pickerOf('a', 'Before', this.a, this.sideA), this.pickerOf('b', 'After', this.b, this.sideB)];
    const unknownOf = (side: 'Before' | 'After', of: CompareSide): UnknownItemWarning[] => of.status === 'ready'
      ? of.model.snapshot.unknownItems.map(entry => ({ side, ...entry }))
      : [];
    this.unknownItems = [...unknownOf('Before', this.sideA), ...unknownOf('After', this.sideB)];
    this.visibleTracked = (this.comparison?.tracked ?? [])
      .map(group => this.changesOnly ? { ...group, rows: group.rows.filter(row => row.delta !== 0) } : group)
      .filter(group => group.rows.length);
  }

  private pickerOf(key: 'a' | 'b', label: 'Before' | 'After', id: string | null, side: CompareSide): PickerView {
    const name = side.status === 'ready' ? side.name : null;
    const mine = this.mine ?? [];
    return {
      key, label, id, side, name,
      plannerPath: side.status === 'ready' ? buildPath(side.shortId, side.name) : null,
      error: side.status === 'error' ? side.error : null,
      options: !id || mine.some(option => option.shortId === id) ? mine : [{ shortId: id, name: name ?? id }, ...mine],
    };
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
    this.refreshView();
  }

  get sameBuild(): boolean {
    return !!this.a && this.a === this.b;
  }


  deltaText(delta: number, checklist: boolean): string {
    if (checklist) {
      return delta > 0 ? 'Gained' : delta < 0 ? 'Lost' : '—';
    }
    return delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '—';
  }

  deltaClass(delta: number): string {
    return delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  }

  trackedNote(row: AffixDiffRow): string | null {
    return row.trackedIn === 'a' ? 'tracked in Before' : row.trackedIn === 'b' ? 'tracked in After' : null;
  }

  /** The row's bonus types, both sides lined up and in the planner's order, for its expanded breakdown. */
  breakdown(row: AffixDiffRow): BreakdownRow[] {
    let rows = this.breakdowns.get(row);
    if (!rows) {
      const byKey = new Map<string, { a?: AffixTypeTotal; b?: AffixTypeTotal }>();
      const add = (type: AffixTypeTotal, side: 'a' | 'b') => {
        const key = `${type.sourceAffixName}|${type.bonusType}`;
        byKey.set(key, { ...byKey.get(key), [side]: type });
      };
      row.a.types.forEach(type => add(type, 'a'));
      row.b.types.forEach(type => add(type, 'b'));
      rows = sortBonusTypes([...byKey.values()].map(({ a, b }) => breakdownRowOf(a, b, row.checklist)));
      this.breakdowns.set(row, rows);
    }
    return rows;
  }

  /** "Ring 1" for Ring1, as the planner names slots. */
  slotName(slot: string): string {
    return slotLabel(slot);
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

function breakdownRowOf(a: AffixTypeTotal | undefined, b: AffixTypeTotal | undefined, checklist: boolean): BreakdownRow {
  const type = (a ?? b)!;
  const keysA = new Set((a?.sources ?? []).map(sourceKey));
  const keysB = new Set((b?.sources ?? []).map(sourceKey));
  const valueA = a?.value ?? null;
  const valueB = b?.value ?? null;
  return {
    label: checklist ? 'Checklist' : type.label,
    bonusType: type.bonusType,
    sourceAffixName: type.sourceAffixName,
    checklist,
    a: valueA,
    b: valueB,
    delta: (valueB ?? 0) - (valueA ?? 0),
    aFrom: (a?.sources ?? []).map(source => breakdownSourceOf(source, !keysB.has(sourceKey(source)))),
    bFrom: (b?.sources ?? []).map(source => breakdownSourceOf(source, !keysA.has(sourceKey(source)))),
    ignored: !!a?.ignored || !!b?.ignored,
  };
}

/** The same item, set or entry on both sides is the same source, whichever slot it moved to. */
function sourceKey(source: AffixSource): string {
  return `${source.kind}|${source.itemName}`;
}

function breakdownSourceOf(source: AffixSource, changed: boolean): BreakdownSource {
  const base = { key: `${source.kind}|${source.slot}|${source.itemName}`, name: source.itemName, changed };
  switch (source.kind) {
    case 'item': return { ...base, slot: source.slot, title: slotLabel(source.slot) };
    case 'set': return { ...base, icon: 'linked-rings', title: 'Set bonus' };
    case 'external': return { ...base, icon: 'aura', title: 'Non-gear' };
    default: return { ...base, icon: 'cut-diamond', title: source.slot };
  }
}
