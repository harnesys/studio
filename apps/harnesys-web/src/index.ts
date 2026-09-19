import { createApp, isProxiedPath } from './app.ts';
import { loadConfig } from './config.ts';
import { handleWsUpgrade, isWebSocketUpgrade, type WsLink, wsHandlers } from './ws-proxy.ts';

const config = loadConfig();
const app = createApp(config);

export default {
  port: config.port,
  idleTimeout: 0,
  fetch(req: Request, server: Bun.Server<WsLink>) {
    if (isProxiedPath(new URL(req.url).pathname) && isWebSocketUpgrade(req)) {
      return handleWsUpgrade(req, server, config);
    }
    return app.fetch(req, server);
  },
  websocket: wsHandlers,
};

console.log(
  `harnesys-web http://127.0.0.1:${config.port} → ${config.upstream.origin} (static: ${config.staticDir})`,
);
