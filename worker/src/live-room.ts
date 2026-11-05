import { Env } from './auth';
import { GONE_CLOSE_CODE, GONE_MESSAGE, GONE_REASON, PING, PONG } from './live';

/**
 * A Durable Object holding the sockets of everyone watching one live list
 * (see live.ts), using the Hibernation API: between messages it's evicted
 * from memory and its sockets stay open at no cost, and the keepalive ping
 * is answered by the runtime without waking it. ProgressRoom watches one
 * saved build, GroupRoom one group run; they differ only in what a new
 * socket is sent first.
 *
 * Driven by the Worker over fetch rather than RPC, so it needs nothing from
 * `cloudflare:workers` and the Node-run tests can construct it with fakes:
 * - /connect?shortId=...: upgrade, then send the list (snapshot());
 * - /send (POST, a message): send it to every socket;
 * - /close (POST): send every socket 'gone', then close it.
 */
export abstract class LiveRoom implements DurableObject {
  constructor(private readonly state: DurableObjectState, protected readonly env: Env) {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /** The message a new socket is sent first, or null to send it 'gone' and close it. */
  protected abstract snapshot(params: URLSearchParams): Promise<string | null>;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    switch (url.pathname) {
      case '/connect':
        return this.openSocket(url.searchParams);
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

  private async openSocket(params: URLSearchParams): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    // Accepted before the list is read, so a change sent meanwhile isn't
    // missed. It may arrive before this snapshot; the page keeps whichever
    // has the later version.
    this.state.acceptWebSocket(server);
    const snapshot = await this.snapshot(params);
    if (snapshot !== null) {
      trySend(server, snapshot);
    } else {
      trySend(server, GONE_MESSAGE);
      tryClose(server, GONE_CLOSE_CODE, GONE_REASON);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Watchers send nothing but the ping, which the auto-response answers. */
  webSocketMessage(): void {
    // Nothing to do.
  }

  /** Completes the closing handshake the page started. */
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
