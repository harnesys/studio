import { join } from 'node:path';
import { prepareHostBinary } from './desktop-host';

const root = join(import.meta.dir, '..');

// tauri dev validates bundle.externalBin: the sidecar file must exist even
// though dev runs the host from sources below.
prepareHostBinary();

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

const tauri = Bun.spawn({
  cmd: ['bunx', 'tauri', 'dev'],
  cwd: join(root, 'apps', 'desktop'),
  stdout: 'inherit',
  stderr: 'inherit',
});

const stop = () => {
  tauri.kill();
  server.kill();
  ui.kill();
  process.exit(0);
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

await Promise.all([server.exited, tauri.exited]);
