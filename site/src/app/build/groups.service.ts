import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import sharedConstants from '../../../../shared/constants.json';
import { environment } from '../../environments/environment';
import type { ShoppingRouteOrder, ShoppingSourcePicks } from '../planner/shopping-list/shopping-list-types';

/** From shared/constants.json - the worker enforces them (routes/groups.ts); these are for the UI. */
export const MAX_GROUP_BUILDS = sharedConstants.maxGroupBuilds;
export const MAX_CHARACTER_NAME_LENGTH = sharedConstants.maxCharacterNameLength;

/** A group run just made: where it is, and the secret half of its link. */
export interface CreatedGroup {
  shortId: string;
  name: string;
  inviteToken: string;
}

/** A group run you host or have a build in. */
export interface GroupSummary extends CreatedGroup {
  isHost: boolean;
  buildCount: number;
  /** When it, or any of its builds' lists, last changed. */
  updatedAt: string;
}

/** What a group's live list can't say about the viewer: whether they host it, and which of its builds are theirs. */
export interface GroupViewer {
  isHost: boolean;
  yourBuildIds: string[];
}

export interface NewGroupBuild {
  buildId: string;
  characterName: string;
}

/** Why adding or renaming a character failed, as far as the page says so. */
export type GroupBuildFailure = 'name-taken' | 'full' | 'already-in' | 'other';

export function groupBuildFailureOf(error: unknown): GroupBuildFailure {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return 'other';
  }
  const body = error.error as { nameTaken?: unknown; full?: unknown } | null;
  return body?.nameTaken ? 'name-taken' : body?.full ? 'full' : 'already-in';
}

/** A character name from a build's name: as much of it as fits. */
export function characterNameFor(buildName: string): string {
  return buildName.trim().slice(0, MAX_CHARACTER_NAME_LENGTH).trim();
}

/** A group run's link: its page, with the invite token in the fragment, which never reaches a server. */
export function groupPath(shortId: string, inviteToken: string): string {
  return `/group/${encodeURIComponent(shortId)}#t=${encodeURIComponent(inviteToken)}`;
}

/** The invite token in a group page's URL fragment, or null. */
export function inviteTokenOf(fragment: string | null): string | null {
  const match = /(?:^|&)t=([^&]+)/.exec(fragment ?? '');
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Group runs - worker/src/routes/groups.ts. Every route is signed in (the
 * auth interceptor sends the token); watching a group's list needs only
 * its invite token, over LiveGroupListService's socket.
 */
@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/groups`;

  constructor(private readonly http: HttpClient) {}

  create(name: string, builds: readonly NewGroupBuild[]): Observable<CreatedGroup> {
    return this.http.post<CreatedGroup>(this.baseUrl, { name, builds });
  }

  listMine(): Observable<GroupSummary[]> {
    return this.http.get<GroupSummary[]>(`${this.baseUrl}/mine`);
  }

  viewer(shortId: string, token: string): Observable<GroupViewer> {
    return this.http.get<GroupViewer>(`${this.groupUrl(shortId)}/me`, { params: { t: token } });
  }

  addBuild(shortId: string, token: string, build: NewGroupBuild): Observable<NewGroupBuild> {
    return this.http.post<NewGroupBuild>(`${this.groupUrl(shortId)}/builds`, build, { params: { t: token } });
  }

  renameBuild(shortId: string, buildId: string, characterName: string): Observable<NewGroupBuild> {
    return this.http.patch<NewGroupBuild>(`${this.groupUrl(shortId)}/builds/${encodeURIComponent(buildId)}`, { characterName });
  }

  removeBuild(shortId: string, buildId: string): Observable<void> {
    return this.http.delete<void>(`${this.groupUrl(shortId)}/builds/${encodeURIComponent(buildId)}`);
  }

  /** The host's shared route: picks to set or forget (null), and the order (null for the default). */
  putRoute(shortId: string, body: { picksPatch?: Record<string, readonly string[] | null>; order?: ShoppingRouteOrder | null }):
      Observable<{ picks: ShoppingSourcePicks; order: ShoppingRouteOrder | null }> {
    return this.http.put<{ picks: ShoppingSourcePicks; order: ShoppingRouteOrder | null }>(`${this.groupUrl(shortId)}/route`, body);
  }

  rotateInvite(shortId: string): Observable<{ inviteToken: string }> {
    return this.http.post<{ inviteToken: string }>(`${this.groupUrl(shortId)}/invite`, {});
  }

  end(shortId: string): Observable<void> {
    return this.http.delete<void>(this.groupUrl(shortId));
  }

  private groupUrl(shortId: string): string {
    return `${this.baseUrl}/${encodeURIComponent(shortId)}`;
  }
}
