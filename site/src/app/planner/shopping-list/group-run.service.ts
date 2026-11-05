import { inject, Injectable, InjectionToken, OnDestroy } from '@angular/core';
import { BehaviorSubject, combineLatest, firstValueFrom, Observable, of, Subscription } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';

import { BuildProgressService, buildProgressFailureOf } from '../../build/build-progress.service';
import { GroupsService, GroupViewer } from '../../build/groups.service';
import { LiveConnection } from '../../build/live-socket';
import { LiveGroupList, LiveGroupListService, LiveGroupMember, LiveGroupState } from '../../build/live-group-list.service';
import { AuthService } from '../../shared/auth.service';
import { FriendShoppingListService } from './friend-shopping-list.service';
import {
  buildGroupListView, chipPatch, GroupMemberEntries, groupProgress, MEMBER_ACCENT_COUNT, neededAfter, ownRowPatch, patchesByBuild
} from './group-shopping-list';
import type {
  ShoppingEntry, ShoppingFilter, ShoppingListView, ShoppingProgress, ShoppingProgressPatch, ShoppingRouteOrder, ShoppingRow
} from './shopping-list-types';

export interface GroupRunTiming {
  /** Quiet time after a tick before it's sent, so a burst of ticks is one write; as the planner's own list waits. */
  sendAfterMs: number;
  /** Waits after failing to reach the server; after the last, the ticks are given up as unsaved. */
  retryAfterMs: readonly number[];
}

/** Specs replace this, so they can run on real timers without waiting. */
export const GROUP_RUN_TIMING = new InjectionToken<GroupRunTiming>('GroupRunTiming', {
  providedIn: 'root',
  factory: () => ({ sendAfterMs: 2000, retryAfterMs: [5000, 15000, 60000] })
});

/** One character of the group, for its chips and the legend. */
export interface GroupCharacter {
  buildId: string;
  characterName: string;
  /** Its colour: `--member-accent-<accent>`. */
  accent: number;
  /** The build is the viewer's: its chips tick it off. */
  mine: boolean;
  needed: number;
  total: number;
  /** The build's own name, and its gear couldn't be read by this version of the site. */
  buildName: string;
  unreadable: boolean;
}

/** Whose rows the list shows. */
export type GroupShowing = 'everyone' | 'mine' | string;

export interface GroupRunView {
  name: string;
  /** The list, once the group has arrived. */
  view: ShoppingListView | null;
  characters: GroupCharacter[];
  connection: LiveConnection;
  gone: boolean;
  isHost: boolean;
  /** The viewer's builds in the group. */
  yours: ReadonlySet<string>;
  showing: GroupShowing;
  /** The characters whose ticks couldn't be saved, to say so. */
  unsaved: string[];
}

/** A tick made on this page, until the build's list says the same. */
interface Pending {
  value: 0 | 1;
  /** The version of the build's list the write that carried it came back as; null while it's still to go. */
  confirmedAt: string | null;
}

/** Each build's ticks still to be sent, by the build's own keys. */
interface Outgoing {
  ticks: Record<string, 0 | 1>;
  timer: ReturnType<typeof setTimeout> | null;
  busy: boolean;
  failures: number;
}

/**
 * One group run's page (GroupRunPageComponent provides it): the group's
 * live list as one shopping list, whose rows each say which characters
 * they're for, and ticking off the viewer's own characters' rows.
 *
 * A tick shows at once and is sent as the build's owner would send it
 * from their own list (PUT .../progress): the tick itself, and the build's
 * still-needed list worked out from the one it last shared (neededAfter),
 * with its route as it was. The build's friends, and every group it's in,
 * then get it over their sockets, this page included.
 */
@Injectable()
export class GroupRunService implements OnDestroy {
  private readonly stateSubject = new BehaviorSubject<LiveGroupState>({ group: null, connection: 'connecting', gone: false });
  private readonly viewerSubject = new BehaviorSubject<GroupViewer>({ isHost: false, yourBuildIds: [] });
  private readonly filterSubject = new BehaviorSubject<ShoppingFilter>('needed');
  private readonly showingSubject = new BehaviorSubject<GroupShowing>('everyone');
  private readonly pendingSubject = new BehaviorSubject<ReadonlyMap<string, Pending>>(new Map());
  private readonly unsavedSubject = new BehaviorSubject<readonly string[]>([]);
  private readonly outgoing = new Map<string, Outgoing>();
  /** Each build's entries, by its blob: worked out again only when its owner saves new gear. */
  private readonly entriesCache = new Map<string, { blob: string; entries: ShoppingEntry[] | null }>();
  private packAccents: ReadonlyMap<string, number> = new Map();
  private readonly subscriptions = new Subscription();
  private shortId = '';
  private token = '';
  private destroyed = false;
  private readonly timing = inject(GROUP_RUN_TIMING);

  readonly view$: Observable<GroupRunView>;

  constructor(
    private readonly live: LiveGroupListService,
    private readonly groups: GroupsService,
    private readonly progressApi: BuildProgressService,
    private readonly friendList: FriendShoppingListService,
    private readonly auth: AuthService
  ) {
    this.view$ = combineLatest([
      this.stateSubject, this.viewerSubject, this.filterSubject, this.showingSubject, this.pendingSubject, this.unsavedSubject
    ]).pipe(map(([state, viewer, filter, showing, pending, unsaved]) => this.viewOf(state, viewer, filter, showing, pending, unsaved)));
  }

  /** Starts watching a group. Once only. */
  open(shortId: string, token: string): void {
    this.shortId = shortId;
    this.token = token;
    this.subscriptions.add(this.live.watch(shortId, token).subscribe(state => {
      this.stateSubject.next(state);
      this.forgetConfirmed(state.group);
    }));
    this.subscriptions.add(this.auth.isAuthenticated$.pipe(
      distinctUntilChanged(),
      // Again when the group's builds change: one may just have been added.
      switchMap(signedIn => signedIn ? this.stateSubject.pipe(
        map(state => state.group?.members.map(member => member.buildId).join('|') ?? null),
        distinctUntilChanged(),
        switchMap(members => members === null ? of(null) : this.groups.viewer(shortId, token).pipe(catchError(() => of(null))))
      ) : of({ isHost: false, yourBuildIds: [] })),
    ).subscribe(viewer => {
      if (viewer) {
        this.viewerSubject.next(viewer);
      }
    }));
  }

  /** The group as it last arrived. */
  get group(): LiveGroupList | null {
    return this.stateSubject.value.group;
  }

  get viewer(): GroupViewer {
    return this.viewerSubject.value;
  }

  /** The viewer's view was refreshed elsewhere (a build added or removed from this page): ask again. */
  refreshViewer(): void {
    this.groups.viewer(this.shortId, this.token).pipe(catchError(() => of(null))).subscribe(viewer => {
      if (viewer) {
        this.viewerSubject.next(viewer);
      }
    });
  }

  setFilter(filter: ShoppingFilter): void {
    this.filterSubject.next(filter);
  }

  show(showing: GroupShowing): void {
    this.showingSubject.next(showing);
  }

  /** A tap on one character's chip on a row: its next copy, then all of them off. */
  toggleChip(row: ShoppingRow, buildId: string): void {
    if (this.viewer.yourBuildIds.includes(buildId)) {
      this.applyPatch(chipPatch(row, buildId, this.progressNow()));
    }
  }

  /** The row's box: all of the viewer's characters' copies in it. */
  toggleRow(row: ShoppingRow): void {
    this.applyPatch(ownRowPatch(row, new Set(this.viewer.yourBuildIds), this.progressNow()));
  }

  /** The host's shared route: picks for a row, or (null) let the list choose. */
  pickSources(row: ShoppingRow, quests: readonly string[] | null): Promise<void> {
    return this.putRoute({ picksPatch: { [row.entry.identity]: quests?.length ? [...quests] : null } });
  }

  /** The host forgets every pick. */
  clearPicks(): Promise<void> {
    const picks = Object.keys(this.group?.picks ?? {});
    return picks.length ? this.putRoute({ picksPatch: Object.fromEntries(picks.map(identity => [identity, null])) }) : Promise.resolve();
  }

  /** The host's Arrange: packs in this order. */
  arrangePacks(packs: readonly string[]): void {
    void this.putRoute({ order: { packs: [...packs], quests: [...(this.group?.order?.quests ?? [])] } });
  }

  /** The host's Arrange: one pack's quests in this order. */
  arrangeQuests(quests: readonly string[]): void {
    const moved = new Set(quests);
    const others = (this.group?.order?.quests ?? []).filter(quest => !moved.has(quest));
    void this.putRoute({ order: { packs: [...(this.group?.order?.packs ?? [])], quests: [...others, ...quests] } });
  }

  resetOrder(): void {
    void this.putRoute({ order: null });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.subscriptions.unsubscribe();
    for (const outgoing of this.outgoing.values()) {
      if (outgoing.timer) {
        clearTimeout(outgoing.timer);
      }
    }
  }

  /**
   * The route arrives back over the socket, as everyone else's page gets
   * it. A host arranging fast is throttled: that step is dropped, and the
   * next one carries the whole order anyway.
   */
  private async putRoute(body: { picksPatch?: Record<string, string[] | null>; order?: ShoppingRouteOrder | null }): Promise<void> {
    try {
      await firstValueFrom(this.groups.putRoute(this.shortId, body));
    } catch {
      // Best effort: see above.
    }
  }

  private progressNow(): ShoppingProgress {
    return groupProgress(this.membersOf(this.group), this.pendingProgress(this.pendingSubject.value));
  }

  private applyPatch(patch: ShoppingProgressPatch): void {
    const pending = new Map(this.pendingSubject.value);
    for (const [key, value] of Object.entries(patch)) {
      if (value !== null) {
        pending.set(key, { value, confirmedAt: null });
      }
    }
    this.pendingSubject.next(pending);
    for (const [buildId, ticks] of patchesByBuild(patch)) {
      const outgoing = this.outgoing.get(buildId) ?? { ticks: {}, timer: null, busy: false, failures: 0 };
      outgoing.ticks = { ...outgoing.ticks, ...ticks };
      this.outgoing.set(buildId, outgoing);
      this.scheduleSend(buildId, this.timing.sendAfterMs);
    }
  }

  private scheduleSend(buildId: string, wait: number): void {
    const outgoing = this.outgoing.get(buildId);
    if (!outgoing || this.destroyed) {
      return;
    }
    if (outgoing.timer) {
      clearTimeout(outgoing.timer);
    }
    outgoing.timer = setTimeout(() => {
      outgoing.timer = null;
      void this.send(buildId);
    }, wait);
  }

  private async send(buildId: string): Promise<void> {
    const outgoing = this.outgoing.get(buildId);
    const member = this.group?.members.find(candidate => candidate.buildId === buildId);
    const entries = member ? this.entriesFor(member) : null;
    if (!outgoing || outgoing.busy || !Object.keys(outgoing.ticks).length) {
      return;
    }
    if (!member || !entries) {
      // Taken out of the group, or its gear can't be read here: nothing to send it against.
      this.giveUp(buildId);
      return;
    }
    const ticks = outgoing.ticks;
    outgoing.ticks = {};
    outgoing.busy = true;
    try {
      const doc = await firstValueFrom(this.progressApi.put(buildId, {
        patch: ticks,
        needed: neededAfter(entries, member.list.needed, ticks),
        route: member.list.route
      }));
      outgoing.failures = 0;
      this.confirm(buildId, ticks, doc.updatedAt);
    } catch (error) {
      // Anything ticked meanwhile is newer, and stays on top.
      outgoing.ticks = { ...ticks, ...outgoing.ticks };
      const failure = buildProgressFailureOf(error);
      if (failure.kind === 'throttled') {
        this.scheduleSend(buildId, failure.retryAfterMs);
      } else if (failure.kind === 'unavailable' && outgoing.failures < this.timing.retryAfterMs.length) {
        this.scheduleSend(buildId, this.timing.retryAfterMs[outgoing.failures++]);
      } else {
        this.giveUp(buildId);
      }
    } finally {
      outgoing.busy = false;
      if (Object.keys(outgoing.ticks).length && !outgoing.timer) {
        this.scheduleSend(buildId, this.timing.sendAfterMs);
      }
    }
  }

  /** Marks a build's sent ticks as waiting only for its list to come back saying so. */
  private confirm(buildId: string, ticks: Record<string, 0 | 1>, at: string | null): void {
    const pending = new Map(this.pendingSubject.value);
    for (const [key, value] of Object.entries(ticks)) {
      const groupKey = `${buildId}|${key}`;
      const current = pending.get(groupKey);
      // A tick made since, on top of this one, is still to go.
      if (current && current.value === value && current.confirmedAt === null) {
        pending.set(groupKey, { value, confirmedAt: at ?? '' });
      }
    }
    this.pendingSubject.next(pending);
    this.forgetConfirmed(this.group);
  }

  /** A build's ticks couldn't be saved: they're undone here, and the page says so. */
  private giveUp(buildId: string): void {
    this.outgoing.delete(buildId);
    const pending = new Map(this.pendingSubject.value);
    for (const key of Array.from(pending.keys())) {
      if (key.startsWith(`${buildId}|`)) {
        pending.delete(key);
      }
    }
    this.pendingSubject.next(pending);
    const name = this.group?.members.find(member => member.buildId === buildId)?.characterName;
    if (name && !this.unsavedSubject.value.includes(name)) {
      this.unsavedSubject.next([...this.unsavedSubject.value, name]);
    }
  }

  /** Drops the ticks the builds' lists now carry. */
  private forgetConfirmed(group: LiveGroupList | null): void {
    if (!group) {
      return;
    }
    const versions = new Map(group.members.map(member => [member.buildId, member.list.version]));
    const pending = this.pendingSubject.value;
    const kept = new Map(Array.from(pending).filter(([key, tick]) => {
      const version = versions.get(key.slice(0, key.indexOf('|')));
      return version !== undefined && (tick.confirmedAt === null || tick.confirmedAt > version);
    }));
    if (kept.size !== pending.size) {
      this.pendingSubject.next(kept);
    }
  }

  private pendingProgress(pending: ReadonlyMap<string, Pending>): ShoppingProgress {
    return Object.fromEntries(Array.from(pending, ([key, tick]) => [key, tick.value]));
  }

  private entriesFor(member: LiveGroupMember): ShoppingEntry[] | null {
    const cached = this.entriesCache.get(member.buildId);
    if (cached?.blob === member.list.blob) {
      return cached.entries;
    }
    const entries = this.friendList.entriesOf(member.list.blob);
    this.entriesCache.set(member.buildId, { blob: member.list.blob, entries });
    return entries;
  }

  private membersOf(group: LiveGroupList | null): GroupMemberEntries[] {
    return (group?.members ?? []).flatMap(member => {
      const entries = this.entriesFor(member);
      return entries ? [{ buildId: member.buildId, characterName: member.characterName, entries, needed: member.list.needed }] : [];
    });
  }

  private viewOf(state: LiveGroupState, viewer: GroupViewer, filter: ShoppingFilter, showing: GroupShowing,
      pending: ReadonlyMap<string, Pending>, unsaved: readonly string[]): GroupRunView {
    const group = state.group;
    const yours = new Set(viewer.yourBuildIds);
    const base: GroupRunView = {
      name: group?.name ?? '', view: null, characters: [], connection: state.connection, gone: state.gone, isHost: viewer.isHost,
      yours, showing, unsaved: [...unsaved]
    };
    if (!group) {
      return base;
    }
    const members = this.membersOf(group);
    const progress = groupProgress(members, this.pendingProgress(pending));
    const characters = group.members.map((member, index): GroupCharacter => {
      const entries = this.entriesFor(member);
      const keys = (entries ?? []).map(entry => `${member.buildId}|${entry.key}`);
      return {
        buildId: member.buildId,
        characterName: member.characterName,
        accent: index % MEMBER_ACCENT_COUNT,
        mine: yours.has(member.buildId),
        needed: keys.filter(key => progress[key] !== 1).length,
        total: keys.length,
        buildName: member.list.name,
        unreadable: entries === null
      };
    });
    const only = showing === 'everyone' ? undefined
      : showing === 'mine' ? yours
        : new Set([showing]);
    const view = buildGroupListView(members, {
      filter, picks: group.picks, order: group.order, pending: this.pendingProgress(pending), only, packAccents: this.packAccents
    });
    this.packAccents = view.packAccents;
    return { ...base, view, characters };
  }
}
