import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { prepareHostBinary } from './desktop-host';

const root = join(import.meta.dir, '..');

prepareHostBinary();
const res = spawnSync('bunx', ['tauri', 'build', '--bundles', 'dmg'], {
  cwd: join(root, 'apps', 'desktop'),
  stdio: 'inherit',
});
process.exit(res.status ?? 1);
