import { join } from 'node:path';

const root = join(import.meta.dir, '..');

const ui = Bun.spawn({
  cmd: ['bunx', 'vite'],
  cwd: join(root, 'apps', 'webui'),
  stdout: 'inherit',
  stderr: 'inherit',
});

const server = Bun.spawn({
  cmd: ['bun', '--watch', 'src/index.ts'],
  cwd: join(root, 'apps', 'server'),
  stdout: 'inherit',
  stderr: 'inherit',
});

const stop = () => {
  ui.kill();
  server.kill();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await Promise.all([ui.exited, server.exited]);
