import { Env } from './auth';
import { getLiveBuildByShortId } from './db';
import { friendListOfRow, GONE_CLOSE_CODE, GONE_MESSAGE, GONE_REASON, LiveMessage, PING, PONG } from './live';

/**
 * One saved build's friends' sockets (see live.ts). A Durable Object, one
 * per shortId, using the Hibernation API: between messages it's evicted
 * from memory and its sockets stay open at no cost, and the keepalive ping
 * is answered by the runtime without waking it.
 *
 * Driven by the Worker over fetch rather than RPC, so it needs nothing from
 * `cloudflare:workers` and the Node-run tests can construct it with fakes:
 * - /connect?shortId=: upgrade, then send the build's list;
 * - /send (POST, a LiveMessage): send it to every socket;
 * - /close (POST): send every socket 'gone', then close it.
 */
export class ProgressRoom implements DurableObject {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/connect':
        return this.openSocket(url.searchParams.get('shortId') ?? '');
      case '/send': {
        const text = await request.text();
        for (const socket of this.state.getWebSockets()) {
          trySend(socket, text);
        }
        return new Response(null, { status: 204 });
      }
      case '/close':
        for (const socket of this.state.getWebSockets()) {
          trySend(socket, GONE_MESSAGE);
          tryClose(socket, GONE_CLOSE_CODE, GONE_REASON);
        }
        return new Response(null, { status: 204 });
      default:
        return new Response(null, { status: 404 });
    }
  }

  private async openSocket(shortId: string): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    // Accepted before the build is read, so a change sent meanwhile isn't
    // missed. It may arrive before this snapshot; the page keeps whichever
    // has the later version.
    this.state.acceptWebSocket(server);
    const row = await getLiveBuildByShortId(this.env.DB, shortId);
    if (row) {
      const message: LiveMessage = { kind: 'list', ...friendListOfRow(row) };
      trySend(server, JSON.stringify(message));
    } else {
      trySend(server, GONE_MESSAGE);
      tryClose(server, GONE_CLOSE_CODE, GONE_REASON);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Friends send nothing but the ping, which the auto-response answers. */
  webSocketMessage(): void {
    // Nothing to do.
  }

  /** Completes the closing handshake the friend's page started. */
  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    // 1005 ("no status") and 1006 ("abnormal") can't be sent back.
    tryClose(socket, code === 1005 || code === 1006 ? 1000 : code, reason);
  }

  webSocketError(): void {
    // The runtime drops the socket; the page reconnects.
  }
}

function trySend(socket: WebSocket, text: string): void {
  try {
    socket.send(text);
  } catch {
    // Closing or closed: that page reconnects and gets a fresh list.
  }
}

function tryClose(socket: WebSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason);
  } catch {
    // Already closed.
  }
}
