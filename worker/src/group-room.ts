import { deleteGroups, getGroupByShortId, listGroupMembers } from './db';
import { GroupLiveMessage, groupListOf } from './live';
import { LiveRoom } from './live-room';
import { isIdle, lastActivityOf, tokenMatches } from './routes/groups';

/**
 * One group run's watchers' sockets (see live.ts and live-room.ts), one per
 * group shortId. A new socket is sent the whole group, if it came with the
 * group's invite token (?t=); a missing group, a wrong token, or a group
 * idle long enough to be deleted (which it is, here) gets 'gone'.
 */
export class GroupRoom extends LiveRoom {
  protected async snapshot(params: URLSearchParams): Promise<string | null> {
    const group = await getGroupByShortId(this.env.DB, params.get('shortId') ?? '');
    if (!group || !tokenMatches(params.get('t'), group.invite_token)) {
      return null;
    }
    const members = await listGroupMembers(this.env.DB, group.id);
    if (isIdle(lastActivityOf(group, members.map(member => member.updated_at)), Date.now())) {
      await deleteGroups(this.env.DB, [group.id]);
      return null;
    }
    const message: GroupLiveMessage = { kind: 'group', ...groupListOf(group, members) };
    return JSON.stringify(message);
  }
}
