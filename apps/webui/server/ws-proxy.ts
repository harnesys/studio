import type { WebConfig } from './config.ts';
import { isAuthorized } from './gate.ts';

const WS_OPEN_TIMEOUT_MS = 10000;
export type WsLink = {
  up?: WebSocket;
  down?: Bun.ServerWebSocket<WsLink>;
  toDown: WsPayload[];
  toUp: WsPayload[];
};
type WsPayload = string | ArrayBuffer | Uint8Array;
function clampCloseCode(code: number | undefined): number | undefined {
  if (code === undefined || code === 1005 || code === 1006 || code === 1015) {
    return undefined;
  }
  return code;
}
function forwardMessage(message: unknown): WsPayload | undefined {
  if (typeof message === 'string' || message instanceof ArrayBuffer) {
    return message;
  }
  if (message instanceof Uint8Array) {
    return message;
  }
  return undefined;
}
export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket';
}
function subprotocols(request: Request): string[] {
  return (request.headers.get('sec-websocket-protocol') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
function wsTarget(upstream: URL, url: URL): string {
  const protocol = upstream.protocol === 'https:' ? 'wss:' : 'ws:';
  const prefix = upstream.pathname.replace(/\/$/, '');
  return `${protocol}//${upstream.host}${prefix}${url.pathname}${url.search}`;
}
export async function handleWsUpgrade(
  request: Request,
  server: Bun.Server<WsLink>,
  config: WebConfig,
): Promise<Response | undefined> {
  if (!isAuthorized(request, config.token)) {
    return new Response('unauthorized', { status: 401 });
  }
  const url = new URL(request.url);
  const requested = subprotocols(request);
  const target = wsTarget(config.upstream, url);
  const link: WsLink = { toDown: [], toUp: [] };
  const up = requested.length > 0 ? new WebSocket(target, requested) : new WebSocket(target);
  up.binaryType = 'arraybuffer';
  let settleOpen: ((opened: boolean) => void) | null = null;
  const settle = (opened: boolean) => {
    settleOpen?.(opened);
    settleOpen = null;
  };
  up.onopen = () => {
    settle(true);
    if (link.down) {
      for (const message of link.toDown) {
        link.down.send(message);
      }
      link.toDown = [];
    }
  };
  up.onmessage = (event) => {
    const payload = forwardMessage(event.data);
    if (payload === undefined) {
      return;
    }
    if (link.down) {
      link.down.send(payload);
    } else {
      link.toDown.push(payload);
    }
  };
  up.onclose = (event) => {
    settle(false);
    link.down?.close(clampCloseCode(event.code), event.reason);
  };
  up.onerror = () => {
    settle(false);
    link.down?.close(1011, 'upstream error');
  };
  link.up = up;
  const opened = await new Promise<boolean>((resolve) => {
    settleOpen = resolve;
    const timer = setTimeout(() => settle(false), WS_OPEN_TIMEOUT_MS);
    timer.unref?.();
  });
  if (!opened) {
    up.close();
    return new Response('upstream websocket unavailable', { status: 502 });
  }
  const headers = new Headers();
  if (up.protocol) {
    headers.set('sec-websocket-protocol', up.protocol);
  }
  if (server.upgrade(request, { data: link, headers })) {
    return undefined;
  }
  up.close();
  return new Response('websocket upgrade failed', { status: 502 });
}
export const wsHandlers: Bun.WebSocketHandler<WsLink> = {
  open(down) {
    const link = down.data;
    link.down = down;
    for (const message of link.toDown) {
      down.send(message);
    }
    link.toDown = [];
    for (const message of link.toUp) {
      link.up?.send(message);
    }
    link.toUp = [];
  },
  message(down, message) {
    const up = down.data.up;
    if (!up || up.readyState !== WebSocket.OPEN) {
      down.data.toUp.push(message);
      return;
    }
    up.send(message);
  },
  close(down, code, reason) {
    down.data.up?.close(clampCloseCode(code), reason);
  },
};
