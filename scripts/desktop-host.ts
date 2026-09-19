import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

function targetTriple(): string {
  try {
    return execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim();
  } catch {
    const out = execSync('rustc -vV', { encoding: 'utf8' });
    const m = out.match(/^host:\s*(.+)$/m);
    if (!m) {
      throw new Error('cannot detect rust host triple');
    }
    return m[1];
  }
}

/** Build build/harnesys-host and stage it as the tauri sidecar with the triple suffix. */
export function prepareHostBinary(): void {
  execSync('bun run build:host', { cwd: root, stdio: 'inherit' });
  const dir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries');
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `harnesys-host-${targetTriple()}`);
  copyFileSync(join(root, 'build', 'harnesys-host'), dest);
  execSync(`chmod 755 '${dest}'`);
}
