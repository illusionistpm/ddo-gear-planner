import { getLiveBuildByShortId } from './db';
import { friendListOfRow, LiveMessage } from './live';
import { LiveRoom } from './live-room';

/**
 * One saved build's friends' sockets (see live.ts and live-room.ts), one
 * per shortId. A new socket is sent the build's list; a missing, private
 * or deleted build, or a short link, gets 'gone'.
 */
export class ProgressRoom extends LiveRoom {
  protected async snapshot(params: URLSearchParams): Promise<string | null> {
    const row = await getLiveBuildByShortId(this.env.DB, params.get('shortId') ?? '');
    if (!row) {
      return null;
    }
    const message: LiveMessage = { kind: 'list', ...friendListOfRow(row) };
    return JSON.stringify(message);
  }
}
