import { join } from 'node:path';

const root = join(import.meta.dir, '..');

const server = Bun.spawn({
  cmd: ['bun', '--watch', 'src/index.ts'],
  cwd: join(root, 'apps', 'server'),
  stdout: 'inherit',
  stderr: 'inherit',
});

const tauri = Bun.spawn({
  cmd: ['bunx', 'tauri', 'dev'],
  cwd: join(root, 'apps', 'desktop'),
  stdout: 'inherit',
  stderr: 'inherit',
});

const stop = () => {
  tauri.kill();
  server.kill();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await Promise.all([server.exited, tauri.exited]);
