import { websocket } from './adapters/http/lsp/bun-websocket.ts';
import { createStudio } from './composition/studio.ts';
import { env } from './config/env.ts';
import { logger } from './config/logger.ts';

const app = createStudio();
export default {
  port: env.port,
  idleTimeout: 0,
  fetch(req: Request, server: Bun.Server<undefined>) {
    return app.fetch(req, server);
  },
  websocket,
};
logger.info({ scope: 'boot' }, `studio api http://127.0.0.1:${env.port} (idleTimeout=0)`);
