import { Injectable } from '@angular/core';
import { convertToParamMap } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { BuildUrlCodecService } from '../../build/build-url-codec.service';
import { LiveBuildList, LiveBuildListService, LiveBuildState, LiveConnection } from '../../build/live-build-list.service';
import { EssenceCraftingService } from '../../gear/essence-crafting.service';
import { GearDbService } from '../../gear/gear-db.service';
import { QuestService } from '../../gear/quest.service';
import { slotsFromParams } from '../slots-from-params';
import { deriveShoppingEntries, ShoppingSourceLookup } from './shopping-list-entries';
import type { ShoppingEntry, ShoppingListView, ShoppingProgress } from './shopping-list-types';
import { buildShoppingListView } from './shopping-list-view-model';

/** A saved build, read for a friend's list without loading it into the planner. */
export type FriendBuild =
  | { status: 'loading' }
  | { status: 'ready'; name: string; entries: ShoppingEntry[] }
  /** Not found (or private, or deleted); a blob this client can't read; or never reached, which may come right on retry. */
  | { status: 'error'; error: 'not-found' | 'invalid-link' | 'network' };

export interface FriendShoppingList {
  /** What's still needed, by quest. */
  view: ShoppingListView;
  /** How many things are still needed. */
  needed: number;
  /** The owner hasn't shared a list for this build: everything it needs is listed. */
  notShared: boolean;
  /** Whether changes are arriving as they're made, or this is the last list that arrived. */
  connection: LiveConnection;
}

/** A friend's page: the build, and once it's read, what it still needs. */
export interface FriendView {
  build: FriendBuild;
  /** Null until the build is ready. */
  list: FriendShoppingList | null;
}

/**
 * A friend's read-only view of what a saved build still needs (see
 * StillNeededPageComponent): the build's own entries, cut down to those
 * the owner last published as still needed, routed and arranged as the
 * owner's list is. Live: the owner's changes and saves arrive as they're
 * made (LiveBuildListService), so there's nothing to refresh.
 *
 * Touches nothing of the planner's or the friend's own: not the equipped
 * gear, progress, picks or the server's copy.
 */
@Injectable({ providedIn: 'root' })
export class FriendShoppingListService {
  private readonly sources: ShoppingSourceLookup;

  constructor(
    private readonly live: LiveBuildListService,
    private readonly codec: BuildUrlCodecService,
    private readonly gearDb: GearDbService,
    private readonly essenceCrafting: EssenceCraftingService,
    quests: QuestService
  ) {
    this.sources = { isRaid: quest => quests.isRaid(quest), packOf: quest => quests.getPack(quest) };
  }

  /** The build the link names and what it still needs, as they change. */
  watch(shortId: string): Observable<FriendView> {
    // The entries are worked out again only when the owner saves new gear.
    let lastBlob: string | null = null;
    let lastBuild: FriendBuild = { status: 'loading' };
    return this.live.watch(shortId).pipe(
      map((state: LiveBuildState): FriendView => {
        if (state.gone) {
          return { build: { status: 'error', error: 'not-found' }, list: null };
        }
        if (!state.list) {
          return { build: state.connection === 'offline' ? { status: 'error', error: 'network' } : { status: 'loading' }, list: null };
        }
        if (state.list.blob !== lastBlob || lastBuild.status !== 'ready') {
          lastBlob = state.list.blob;
          lastBuild = this.readBuild(state.list);
        } else if (lastBuild.name !== state.list.name) {
          lastBuild = { ...lastBuild, name: state.list.name };
        }
        const build = lastBuild;
        return { build, list: build.status === 'ready' ? listOf(build.entries, state.list, state.connection) : null };
      })
    );
  }

  /** Everything a saved build's gear needs, from its blob; null for a blob this client can't read. */
  entriesOf(blob: string): ShoppingEntry[] | null {
    const decoded = this.codec.decode(blob);
    if (!decoded) {
      return null;
    }
    const slots = slotsFromParams(convertToParamMap(decoded), this.gearDb, this.essenceCrafting);
    return deriveShoppingEntries(slots, this.sources);
  }

  private readBuild({ name, blob }: LiveBuildList): FriendBuild {
    const entries = this.entriesOf(blob);
    return entries ? { status: 'ready', name, entries } : { status: 'error', error: 'invalid-link' };
  }
}

/** What's still needed of the build's entries, as its owner's list says. */
function listOf(entries: readonly ShoppingEntry[], shared: LiveBuildList, connection: LiveConnection): FriendShoppingList {
  const needed = shared.needed === null ? null : new Set(shared.needed);
  // Every entry not still needed counts as got, so the 'needed' filter leaves only what is.
  const progress: ShoppingProgress = needed === null ? {}
    : Object.fromEntries(entries.filter(entry => !needed.has(entry.key)).map(entry => [entry.key, 1 as const]));
  const view = buildShoppingListView(entries, progress, null,
    { filter: 'needed', picks: needed === null ? {} : shared.route, order: shared.order ?? undefined });
  return { view, needed: view.total - view.acquired, notShared: needed === null, connection };
}
