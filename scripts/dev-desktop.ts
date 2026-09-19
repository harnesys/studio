import { join } from 'node:path';
import { prepareHostBinary } from './desktop-host';

const root = join(import.meta.dir, '..');

// tauri dev validates bundle.externalBin: the sidecar file must exist even
// though dev uses the source server below.
prepareHostBinary({ fresh: false });

const server = Bun.spawn({
  cmd: ['bun', '--watch', 'src/index.ts'],
  cwd: join(root, 'apps', 'server'),
  stdout: 'inherit',
  stderr: 'inherit',
});

// The source server must own :47474 before tauri boots — otherwise lib.rs
// spawns the staged (stale) sidecar with no bundled assets.
let hostUp = false;
for (let i = 0; i < 25; i++) {
  try {
    const res = await fetch('http://127.0.0.1:47474/health', {
      signal: AbortSignal.timeout(400),
    });
    if (res.ok) {
      hostUp = true;
      break;
    }
  } catch {
    // host not up yet
  }
  await Bun.sleep(200);
}
if (!hostUp) {
  console.error('host did not come up on :47474 — aborting dev:desktop');
  server.kill();
  process.exit(1);
}

// Vite itself comes from tauri.conf beforeDevCommand — a second vite here
// would race for :5173 and push the real one to :5174.
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
