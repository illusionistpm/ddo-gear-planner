import { AuthenticatedUser, Env } from '../auth';
import {
  countGroupsHostedBy,
  deleteGroupBuild,
  deleteGroups,
  ensureUser,
  getBuildById,
  getGroupByShortId,
  GroupBuildRow,
  GroupRow,
  GroupSummaryRow,
  insertGroupBuildIfUnderLimit,
  listGroupMembers,
  listGroupsForUser,
  renameGroupBuild,
  reserveAndInsertGroup,
  updateGroupInviteToken,
  updateGroupName,
  updateGroupRouteIfUnchanged
} from '../db';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import { closeGroup, RouteOrder, tellGroup, Waiter } from '../live';
import { generateShortId, withUniqueShortId } from '../shortId';
import sharedConstants from '../../../shared/constants.json';
import { MAX_NAME_LENGTH } from './builds';
import { resolveOwnerUserId } from './ownership';
import { MAX_PICKS, MAX_PROGRESS_BYTES, MIN_WRITE_INTERVAL_MS, mergePatch, parseProgressPut, throttled } from './progress';

// Group runs (see migrations/0008): several saved builds, from any number
// of friends, shopped for as one list with one shared route. A group holds
// no ticks: each build's owner ticks it off as ever (routes/progress.ts),
// and the group's live room (group-room.ts) reads every build's list from
// there. These routes change who's in it and the route it takes.
//
// Who may do what:
// - anyone holding the invite token watches the list (the socket) and,
//   signed in, adds their own saved builds;
// - a build's owner renames its character or takes it out;
// - the host also takes anyone's build out, arranges the shared route,
//   rotates the invite token and ends the group.
// A wrong token reads as no group at all, as a private build reads as a
// missing one.

export const MAX_GROUP_BUILDS = sharedConstants.maxGroupBuilds;
export const MAX_GROUPS_PER_USER = sharedConstants.maxGroupsPerUser;
export const MAX_CHARACTER_NAME_LENGTH = sharedConstants.maxCharacterNameLength;
/** A group with no change and no tick for this long is deleted, lazily, the next time it's listed or watched. */
export const GROUP_IDLE_MS = sharedConstants.groupIdleDays * 24 * 60 * 60 * 1000;
const DEFAULT_GROUP_NAME = 'Shopping list';
// About 131 bits, from shortId.ts's alphabet: a secret, not a name.
const INVITE_TOKEN_LENGTH = 22;
const TOO_BIG = 'That route is too big to save.';
const NO_GROUP = 'No group run found for that link.';

const SHORT_ID_COLLISION_PATTERN = /UNIQUE constraint failed:\s*(short_ids\.short_id|groups\.short_id)/i;
const DUPLICATE_BUILD_PATTERN = /UNIQUE constraint failed:.*group_builds\.build_id/i;
const DUPLICATE_CHARACTER_PATTERN = /UNIQUE constraint failed:.*group_builds\.character_name/i;

function matches(pattern: RegExp, err: unknown): boolean {
  return err instanceof Error && pattern.test(err.message);
}

export function validateCharacterName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed && trimmed.length <= MAX_CHARACTER_NAME_LENGTH ? trimmed : null;
}

function validateGroupName(name: unknown): string | null {
  if (name === undefined || name === null || name === '') {
    return DEFAULT_GROUP_NAME;
  }
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length <= MAX_NAME_LENGTH ? trimmed || DEFAULT_GROUP_NAME : null;
}

/** Whether a token matches, comparing every character so the time taken says nothing of where it differs. */
export function tokenMatches(given: string | null, stored: string): boolean {
  if (given === null || given.length !== stored.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < stored.length; i++) {
    difference |= given.charCodeAt(i) ^ stored.charCodeAt(i);
  }
  return difference === 0;
}

/** When a group last changed, or any of its builds' lists did. */
export function lastActivityOf(group: { updated_at: string }, listUpdates: readonly (string | null)[]): string {
  return listUpdates.reduce<string>((latest, at) => at && at > latest ? at : latest, group.updated_at);
}

export function isIdle(lastActivity: string, now: number): boolean {
  return Date.parse(lastActivity) + GROUP_IDLE_MS < now;
}

function idleOf(row: GroupSummaryRow, now: number): boolean {
  return isIdle(lastActivityOf(row, [row.progress_at]), now);
}

function orderOf(text: string | null): RouteOrder | null {
  return text === null ? null : JSON.parse(text) as RouteOrder;
}

/** The group, if the token is its invite token; else the 404 that says there's none. */
async function groupForToken(env: Env, shortId: string, token: string | null): Promise<GroupRow | Response> {
  const group = await getGroupByShortId(env.DB, shortId);
  return group && tokenMatches(token, group.invite_token) ? group : errorResponse(404, NO_GROUP);
}

/** The group and the host's user id, or the response refusing the caller: 404 for no group, 403 for anyone but its host. */
async function groupForHost(env: Env, shortId: string, user: AuthenticatedUser): Promise<{ group: GroupRow; userId: string } | Response> {
  const group = await getGroupByShortId(env.DB, shortId);
  if (!group) {
    return errorResponse(404, NO_GROUP);
  }
  const userId = await resolveOwnerUserId(env, user);
  if (!userId || userId !== group.host_user_id) {
    return errorResponse(403, 'Only the group\'s host can do that.');
  }
  return { group, userId };
}

/** Deletes the idle groups among a user's, returning the rest. */
async function pruneIdle(env: Env, rows: readonly GroupSummaryRow[], now: number): Promise<GroupSummaryRow[]> {
  const idle = rows.filter(row => idleOf(row, now));
  if (idle.length) {
    const groups = await Promise.all(idle.map(row => getGroupByShortId(env.DB, row.short_id)));
    await deleteGroups(env.DB, groups.flatMap(group => group ? [group.id] : []));
  }
  return rows.filter(row => !idleOf(row, now));
}

/** The caller's user id, creating the row if this is their first call, as handleCreateBuild does. */
async function ensureCaller(env: Env, user: AuthenticatedUser): Promise<string> {
  return ensureUser(env.DB, {
    auth0Sub: user.sub,
    email: user.email ?? null,
    emailVerified: user.emailVerified ?? false,
    displayName: user.name ?? null
  });
}

interface NewMember {
  buildId: string;
  characterName: string;
}

function parseNewMembers(value: unknown): NewMember[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_GROUP_BUILDS) {
    return null;
  }
  const members: NewMember[] = [];
  for (const item of value) {
    const { buildId, characterName } = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const name = validateCharacterName(characterName);
    if (typeof buildId !== 'string' || !buildId || !name) {
      return null;
    }
    members.push({ buildId, characterName: name });
  }
  return members;
}

/**
 * POST /api/groups. Body: {name?, builds?: [{buildId, characterName}]},
 * the caller's own builds to start it with. The caller hosts it. Answers
 * 201 with its shortId and invite token.
 */
export async function handleCreateGroup(request: Request, user: AuthenticatedUser, env: Env): Promise<Response> {
  const body = await readJsonBody(request, 16384, 'That group is too big to create.');
  if (body instanceof Response) {
    return body;
  }
  const fields = (typeof body === 'object' && body !== null && !Array.isArray(body) ? body : null) as Record<string, unknown> | null;
  const name = validateGroupName(fields?.['name']);
  const members = fields ? parseNewMembers(fields['builds']) : null;
  if (!fields || !name || !members) {
    return errorResponse(400, `A group run needs a name of up to ${MAX_NAME_LENGTH} characters, and each build a character name of 1-${MAX_CHARACTER_NAME_LENGTH}.`);
  }
  if (new Set(members.map(member => member.buildId)).size !== members.length) {
    return errorResponse(400, 'A build can only be in a group once.');
  }
  if (new Set(members.map(member => member.characterName.toLowerCase())).size !== members.length) {
    return errorResponse(409, 'Each character in a group needs a different name.');
  }

  const userId = await ensureCaller(env, user);
  for (const member of members) {
    const build = await getBuildById(env.DB, member.buildId);
    if (!build || build.owner_user_id !== userId) {
      return errorResponse(403, 'You can only add your own builds.');
    }
  }

  const now = Date.now();
  await pruneIdle(env, (await listGroupsForUser(env.DB, userId)).filter(row => row.host_user_id === userId), now);
  if (await countGroupsHostedBy(env.DB, userId) >= MAX_GROUPS_PER_USER) {
    return errorResponse(409, `You're hosting ${MAX_GROUPS_PER_USER} group runs already. End one to start another.`);
  }

  const at = new Date(now).toISOString();
  const id = crypto.randomUUID();
  const inviteToken = generateShortId(INVITE_TOKEN_LENGTH);
  const shortId = await withUniqueShortId(async candidate => {
    const group: GroupRow = {
      id, short_id: candidate, host_user_id: userId, name, invite_token: inviteToken,
      picks: '{}', route_order: null, created_at: at, updated_at: at
    };
    const rows: GroupBuildRow[] = members.map(member => ({
      group_id: id, build_id: member.buildId, added_by_user_id: userId, character_name: member.characterName, added_at: at
    }));
    await reserveAndInsertGroup(env.DB, group, rows);
    return candidate;
  }, { isUniqueConstraintError: err => matches(SHORT_ID_COLLISION_PATTERN, err) });

  return jsonResponse({ shortId, name, inviteToken }, { status: 201 });
}

/** GET /api/groups/mine: the groups the caller hosts or has a build in, idle ones deleted. */
export async function handleListMyGroups(user: AuthenticatedUser, env: Env): Promise<Response> {
  const userId = await resolveOwnerUserId(env, user);
  if (!userId) {
    return jsonResponse([]);
  }
  const rows = await pruneIdle(env, await listGroupsForUser(env.DB, userId), Date.now());
  return jsonResponse(rows.map(row => ({
    shortId: row.short_id,
    name: row.name,
    inviteToken: row.invite_token,
    isHost: row.host_user_id === userId,
    buildCount: row.build_count,
    // Which of the caller's builds it holds, so the planner can offer to rejoin it from one of them.
    yourBuildIds: row.your_build_ids ? row.your_build_ids.split(',') : [],
    // Who's on it, so a list of lists can tell them apart.
    characterNames: row.character_names ? JSON.parse(row.character_names) as string[] : [],
    updatedAt: lastActivityOf(row, [row.progress_at])
  })));
}

/**
 * GET /api/groups/:shortId/me?t=: what the group's live list can't say,
 * because a browser's socket carries no token: whether the caller hosts
 * it, and which of its builds are theirs.
 */
export async function handleGetGroupMe(shortId: string, token: string | null, user: AuthenticatedUser, env: Env): Promise<Response> {
  const group = await groupForToken(env, shortId, token);
  if (group instanceof Response) {
    return group;
  }
  const userId = await resolveOwnerUserId(env, user);
  const members = await listGroupMembers(env.DB, group.id);
  return jsonResponse({
    isHost: userId !== null && userId === group.host_user_id,
    yourBuildIds: userId === null ? [] : members.filter(member => member.owner_user_id === userId).map(member => member.build_id)
  });
}

/** POST /api/groups/:shortId/builds?t=. Body: {buildId, characterName}, one of the caller's own builds. */
export async function handleAddGroupBuild(
  request: Request, shortId: string, token: string | null, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const group = await groupForToken(env, shortId, token);
  if (group instanceof Response) {
    return group;
  }
  const body = await readJsonBody(request, 1024, 'That request is too big.');
  if (body instanceof Response) {
    return body;
  }
  const [member] = parseNewMembers([body]) ?? [];
  if (!member) {
    return errorResponse(400, `A build needs a character name of 1-${MAX_CHARACTER_NAME_LENGTH} characters.`);
  }
  const userId = await resolveOwnerUserId(env, user);
  const build = await getBuildById(env.DB, member.buildId);
  if (!userId || !build || build.owner_user_id !== userId) {
    return errorResponse(403, 'You can only add your own builds.');
  }

  let added: boolean;
  try {
    added = await insertGroupBuildIfUnderLimit(env.DB, {
      group_id: group.id, build_id: build.id, added_by_user_id: userId, character_name: member.characterName,
      added_at: new Date().toISOString()
    }, MAX_GROUP_BUILDS);
  } catch (err) {
    if (matches(DUPLICATE_BUILD_PATTERN, err)) {
      return errorResponse(409, 'That build is in this group already.');
    }
    if (matches(DUPLICATE_CHARACTER_PATTERN, err)) {
      return jsonResponse({ error: `A character in this group is called ${member.characterName} already.`, nameTaken: true }, { status: 409 });
    }
    throw err;
  }
  if (!added) {
    return jsonResponse({ error: `A group run holds up to ${MAX_GROUP_BUILDS} builds.`, full: true }, { status: 409 });
  }
  tellGroup(env, waiter, group.short_id);
  return jsonResponse({ buildId: build.id, characterName: member.characterName }, { status: 201 });
}

/** PATCH /api/groups/:shortId/builds/:buildId. Body: {characterName}. The build's owner only. */
export async function handleRenameGroupBuild(
  request: Request, shortId: string, buildId: string, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const group = await getGroupByShortId(env.DB, shortId);
  if (!group) {
    return errorResponse(404, NO_GROUP);
  }
  const body = await readJsonBody(request, 1024, 'That request is too big.');
  if (body instanceof Response) {
    return body;
  }
  const name = validateCharacterName((body as Record<string, unknown> | null)?.['characterName']);
  if (!name) {
    return errorResponse(400, `A character name is 1-${MAX_CHARACTER_NAME_LENGTH} characters.`);
  }
  const userId = await resolveOwnerUserId(env, user);
  const build = await getBuildById(env.DB, buildId);
  if (!userId || !build || build.owner_user_id !== userId) {
    return errorResponse(403, 'You can only rename your own characters.');
  }
  let renamed: boolean;
  try {
    renamed = await renameGroupBuild(env.DB, group.id, buildId, name, new Date().toISOString());
  } catch (err) {
    if (matches(DUPLICATE_CHARACTER_PATTERN, err)) {
      return jsonResponse({ error: `A character in this group is called ${name} already.`, nameTaken: true }, { status: 409 });
    }
    throw err;
  }
  if (!renamed) {
    return errorResponse(404, 'That build isn\'t in this group.');
  }
  tellGroup(env, waiter, group.short_id);
  return jsonResponse({ buildId, characterName: name });
}

/** DELETE /api/groups/:shortId/builds/:buildId. The build's owner, or the host. */
export async function handleRemoveGroupBuild(
  shortId: string, buildId: string, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const group = await getGroupByShortId(env.DB, shortId);
  if (!group) {
    return errorResponse(404, NO_GROUP);
  }
  const userId = await resolveOwnerUserId(env, user);
  if (!userId) {
    return errorResponse(403, 'Only the build\'s owner or the group\'s host can take it out.');
  }
  if (userId !== group.host_user_id) {
    const build = await getBuildById(env.DB, buildId);
    if (!build || build.owner_user_id !== userId) {
      return errorResponse(403, 'Only the build\'s owner or the group\'s host can take it out.');
    }
  }
  if (!await deleteGroupBuild(env.DB, group.id, buildId, new Date().toISOString())) {
    return errorResponse(404, 'That build isn\'t in this group.');
  }
  tellGroup(env, waiter, group.short_id);
  return new Response(null, { status: 204 });
}

/**
 * PUT /api/groups/:shortId/route. Body: {picksPatch?, order?}, as PUT
 * .../progress takes them; order null puts the route back in its default
 * order. The host only. Throttled like a build's progress, one write every
 * MIN_WRITE_INTERVAL_MS. Answers with the route as stored.
 */
export async function handlePutGroupRoute(
  request: Request, shortId: string, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const hosted = await groupForHost(env, shortId, user);
  if (hosted instanceof Response) {
    return hosted;
  }
  const { group } = hosted;
  const body = await readJsonBody(request, MAX_PROGRESS_BYTES, TOO_BIG);
  if (body instanceof Response) {
    return body;
  }
  const put = parseProgressPut(body);
  if (!put || put.patch.size || put.published) {
    return errorResponse(400, 'Invalid route.');
  }

  const now = Date.now();
  const waitMs = Date.parse(group.updated_at) + MIN_WRITE_INTERVAL_MS - now;
  if (waitMs > 0) {
    return throttled(waitMs);
  }
  const picks = mergePatch(JSON.parse(group.picks) as Record<string, string[]>, put.picksPatch);
  const routeOrder = put.order === undefined ? group.route_order : put.order && JSON.stringify(put.order);
  const picksText = JSON.stringify(picks);
  if (Object.keys(picks).length > MAX_PICKS || picksText.length + (routeOrder?.length ?? 0) > MAX_PROGRESS_BYTES) {
    return errorResponse(413, TOO_BIG);
  }
  const written = await updateGroupRouteIfUnchanged(env.DB, group.id,
    { picks: picksText, route_order: routeOrder, updated_at: new Date(now).toISOString() },
    { baseUpdatedAt: group.updated_at, notAfter: new Date(now - MIN_WRITE_INTERVAL_MS).toISOString() });
  if (!written) {
    return throttled(MIN_WRITE_INTERVAL_MS);
  }
  tellGroup(env, waiter, group.short_id);
  return jsonResponse({ picks, order: orderOf(routeOrder) });
}

/** PATCH /api/groups/:shortId. Body: {name}, 1-MAX_NAME_LENGTH characters. The host only. */
export async function handleRenameGroup(
  request: Request, shortId: string, user: AuthenticatedUser, env: Env, waiter: Waiter
): Promise<Response> {
  const hosted = await groupForHost(env, shortId, user);
  if (hosted instanceof Response) {
    return hosted;
  }
  const body = await readJsonBody(request, 1024, 'That request is too big.');
  if (body instanceof Response) {
    return body;
  }
  const given = (body as Record<string, unknown> | null)?.['name'];
  const name = typeof given === 'string' ? given.trim() : '';
  if (!name || name.length > MAX_NAME_LENGTH) {
    return errorResponse(400, `A list's name is 1-${MAX_NAME_LENGTH} characters.`);
  }
  await updateGroupName(env.DB, hosted.group.id, name, new Date().toISOString());
  tellGroup(env, waiter, shortId);
  return jsonResponse({ name });
}

/** POST /api/groups/:shortId/invite: a new invite token. The old link stops working, and its sockets close. */
export async function handleRotateGroupInvite(shortId: string, user: AuthenticatedUser, env: Env, waiter: Waiter): Promise<Response> {
  const hosted = await groupForHost(env, shortId, user);
  if (hosted instanceof Response) {
    return hosted;
  }
  const inviteToken = generateShortId(INVITE_TOKEN_LENGTH);
  await updateGroupInviteToken(env.DB, hosted.group.id, inviteToken, new Date().toISOString());
  closeGroup(env, waiter, shortId);
  return jsonResponse({ inviteToken });
}

/** DELETE /api/groups/:shortId: ends the group. The builds in it are untouched. */
export async function handleDeleteGroup(shortId: string, user: AuthenticatedUser, env: Env, waiter: Waiter): Promise<Response> {
  const hosted = await groupForHost(env, shortId, user);
  if (hosted instanceof Response) {
    return hosted;
  }
  await deleteGroups(env.DB, [hosted.group.id]);
  closeGroup(env, waiter, shortId);
  return new Response(null, { status: 204 });
}
