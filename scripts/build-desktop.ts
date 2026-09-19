import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { bunTargetFor, prepareHostBinary } from './desktop-host';

const root = join(import.meta.dir, '..');

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

function main(): void {
    const args = process.argv.slice(2);
    const i = args.indexOf('--target');
    const target = i >= 0 ? args[i + 1] : undefined;
    if (target && !bunTargetFor(target)) {
        console.error(
            `build-desktop: unsupported target "${target}" — supported: aarch64-apple-darwin, x86_64-apple-darwin`,
        );
        process.exit(1);
    }
    prepareHostBinary({ rustTarget: target });
    const res = spawnSync(
        'bunx',
        target
            ? ['tauri', 'build', '--bundles', 'dmg', '--target', target]
            : ['tauri', 'build', '--bundles', 'dmg'],
        { cwd: join(root, 'apps', 'desktop'), stdio: 'inherit', env: signingEnv() },
    );
    process.exit(res.status ?? 1);
}

main();
