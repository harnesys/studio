import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
const root = join(import.meta.dir, '..');
function targetTriple(): string {
    try {
        return execSync('rustc --print host-tuple', { encoding: 'utf8' }).trim();
    }
    catch {
        const out = execSync('rustc -vV', { encoding: 'utf8' });
        const m = out.match(/^host:\s*(.+)$/m);
        if (!m) {
            throw new Error('cannot detect rust host triple');
        }
        return m[1];
    }
}
function stageSidecar(source: string, dest: string): void {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    execSync(`chmod 755 '${dest}'`);
}
export function prepareHostBinary({ fresh = true }: {
    fresh?: boolean;
} = {}): void {
    const dir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries');
    const dest = join(dir, `harnesys-host-${targetTriple()}`);
    if (!fresh) {
        if (existsSync(dest)) {
            return;
        }
        const built = join(root, 'build', 'harnesys-host');
        if (existsSync(built)) {
            stageSidecar(built, dest);
            return;
        }
    }
    execSync('bun run build:host', { cwd: root, stdio: 'inherit' });
    stageSidecar(join(root, 'build', 'harnesys-host'), dest);
}
