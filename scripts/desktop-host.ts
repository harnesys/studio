import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const root = join(import.meta.dir, '..');
const IS_WINDOWS = process.platform === 'win32';
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
    if (!IS_WINDOWS) {
        execSync(`chmod 755 '${dest}'`);
    }
}
function buildHostWithAssets(command: string): void {
    execSync(command, { cwd: root, stdio: 'inherit' });
    rmSync(join(root, 'build', 'assets'), { recursive: true, force: true });
    cpSync(join(root, 'apps', 'server', 'assets'), join(root, 'build', 'assets'), {
        recursive: true,
    });
}
function resolveBuiltBinary(base: string): string {
    const exe = `${base}.exe`;
    if (existsSync(exe)) {
        return exe;
    }
    if (!existsSync(base)) {
        throw new Error(`built host binary not found at ${base}`);
    }
    return base;
}

const RUST_TO_BUN: Record<string, string> = {
    'aarch64-apple-darwin': 'bun-darwin-arm64',
    'x86_64-apple-darwin': 'bun-darwin-x64',
    'x86_64-pc-windows-msvc': 'bun-windows-x64',
    'aarch64-pc-windows-msvc': 'bun-windows-arm64',
    'x86_64-unknown-linux-gnu': 'bun-linux-x64',
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
    const triple = rustTarget ?? targetTriple();
    const isWindowsTarget = rustTarget ? rustTarget.includes('windows') : IS_WINDOWS;
    const dest = join(dir, `harnesys-host-${triple}${isWindowsTarget ? '.exe' : ''}`);
    if (!fresh) {
        if (existsSync(dest)) {
            return;
        }
        const built = resolveBuiltBinary(join(root, 'build', 'harnesys-host'));
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
        buildHostWithAssets(
            `bun build --compile --target=${bunTarget} apps/server/src/index.ts --outfile build/harnesys-host`,
        );
    } else {
        buildHostWithAssets(
            'bun build --compile apps/server/src/index.ts --outfile build/harnesys-host',
        );
    }
    stageSidecar(resolveBuiltBinary(join(root, 'build', 'harnesys-host')), dest);
}
