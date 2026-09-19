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

const RUST_TO_BUN: Record<string, string> = {
    'aarch64-apple-darwin': 'bun-darwin-arm64',
    'x86_64-apple-darwin': 'bun-darwin-x64',
};

export function bunTargetFor(rustTarget: string): string | undefined {
    return RUST_TO_BUN[rustTarget];
}

export function prepareHostBinary({
    fresh = true,
    rustTarget,
}: {
    fresh?: boolean;
    rustTarget?: string;
} = {}): void {
    const dir = join(root, 'apps', 'desktop', 'src-tauri', 'binaries');
    const dest = join(dir, `harnesys-host-${rustTarget ?? targetTriple()}`);
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
    if (rustTarget) {
        const bunTarget = bunTargetFor(rustTarget);
        if (!bunTarget) {
            throw new Error(`unsupported rust target "${rustTarget}"`);
        }
        execSync(
            `bun build --compile --target=${bunTarget} apps/server/src/index.ts --outfile build/harnesys-host && rm -rf build/assets && cp -R apps/server/assets build/assets`,
            { cwd: root, stdio: 'inherit' },
        );
    } else {
        execSync('bun run build:host', { cwd: root, stdio: 'inherit' });
    }
    stageSidecar(join(root, 'build', 'harnesys-host'), dest);
}
