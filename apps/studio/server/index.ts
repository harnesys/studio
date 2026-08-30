import { join } from 'node:path';
import { serveStatic } from 'hono/bun';
import { createStudio } from './composition/studio.ts';
import { env } from './config/env.ts';

const app = createStudio();
const dist = join(import.meta.dir, '..', 'client', 'dist');

if (env.production) {
  app.use('/*', serveStatic({ root: dist }));
  app.get('*', serveStatic({ path: join(dist, 'index.html') }));
}

export default {
  port: env.port,
  idleTimeout: 0,
  fetch: app.fetch,
};

console.log(`studio api http://127.0.0.1:${env.port} (idleTimeout=0)`);
