import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { bunTargetFor, prepareHostBinary } from './desktop-host';

const root = join(import.meta.dir, '..');
const IS_WINDOWS = process.platform === 'win32';

const SIGN_ENV_KEYS = [
    'APPLE_CERTIFICATE',
    'APPLE_CERTIFICATE_PASSWORD',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_API_ISSUER',
    'APPLE_API_KEY',
] as const;

function signingEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    for (const key of SIGN_ENV_KEYS) {
        if (!env[key]) delete env[key];
    }
    return env;
}

const SUPPORTED_TARGETS = [
    'aarch64-apple-darwin',
    'x86_64-apple-darwin',
    'x86_64-pc-windows-msvc',
    'aarch64-pc-windows-msvc',
    'x86_64-unknown-linux-gnu',
] as const;

type TargetPlatform = 'darwin' | 'windows' | 'linux';

function targetPlatform(rustTarget: string | undefined): TargetPlatform {
    if (rustTarget) {
        if (rustTarget.endsWith('-darwin')) {
            return 'darwin';
        }
        if (rustTarget.includes('windows')) {
            return 'windows';
        }
        if (rustTarget.includes('-linux-')) {
            return 'linux';
        }
        throw new Error(`cannot infer platform for target "${rustTarget}"`);
    }
    if (process.platform === 'darwin') {
        return 'darwin';
    }
    if (IS_WINDOWS) {
        return 'windows';
    }
    return 'linux';
}

function bundlesFor(platform: TargetPlatform): string {
    if (platform === 'darwin') {
        return 'dmg';
    }
    if (platform === 'windows') {
        return 'nsis';
    }
    return 'appimage deb';
}

function main(): void {
    const args = process.argv.slice(2);
    const i = args.indexOf('--target');
    const target = i >= 0 ? args[i + 1] : undefined;
    if (target && !bunTargetFor(target)) {
        console.error(
            `build-desktop: unsupported target "${target}" — supported: ${SUPPORTED_TARGETS.join(', ')}`,
        );
        process.exit(1);
    }
    prepareHostBinary({ rustTarget: target });
    const cliArgs = ['tauri', 'build', '--bundles', bundlesFor(targetPlatform(target))];
    if (target) {
        cliArgs.push('--target', target);
    }
    const res = spawnSync('bunx', cliArgs, {
        cwd: join(root, 'apps', 'desktop'),
        stdio: 'inherit',
        env: signingEnv(),
        shell: IS_WINDOWS,
    });
    process.exit(res.status ?? 1);
}

main();
