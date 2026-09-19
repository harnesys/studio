import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

const VERSION_FILES = [
    'apps/desktop/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
] as const;

const CARGO_TOML = 'apps/desktop/src-tauri/Cargo.toml';
const CARGO_LOCK = 'apps/desktop/src-tauri/Cargo.lock';

function fail(message: string): never {
    console.error(`release: ${message}`);
    process.exit(1);
}

function git(command: string): string {
    return execSync(`git ${command}`, { cwd: root, encoding: 'utf8' }).trim();
}

function bumpJson(text: string, version: string): string {
    const json = JSON.parse(text) as { version: string };
    json.version = version;
    return `${JSON.stringify(json, null, 2)}\n`;
}

function bumpCargo(text: string, version: string): string {
    let inPackage = false;
    let done = false;
    const lines = text.split('\n').map((line) => {
        if (line === '[package]') {
            inPackage = true;
            return line;
        }
        if (inPackage && line.startsWith('[')) {
            inPackage = false;
            return line;
        }
        if (inPackage && !done && line.startsWith('version = ')) {
            done = true;
            return `version = "${version}"`;
        }
        return line;
    });
    if (!done) fail(`no version key in [package] of ${CARGO_TOML}`);
    return lines.join('\n');
}

function main(): void {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const version = args.find((a) => a !== '--dry-run');
    if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
        fail('usage: bun run release <semver> [--dry-run]');
    }
    if (git('status --porcelain') !== '') {
        fail('working tree is not clean — commit or stash first');
    }

    const originals = new Map<string, string>();
    for (const file of VERSION_FILES) {
        const path = join(root, file);
        const text = readFileSync(path, 'utf8');
        originals.set(file, text);
        writeFileSync(path, bumpJson(text, version));
    }
    const cargoPath = join(root, CARGO_TOML);
    const cargoText = readFileSync(cargoPath, 'utf8');
    originals.set(CARGO_TOML, cargoText);
    writeFileSync(cargoPath, bumpCargo(cargoText, version));

    const files = [...VERSION_FILES, CARGO_TOML, CARGO_LOCK].join(' ');
    const plan = [
        `cargo update -p desktop  (in ${join(root, 'apps/desktop/src-tauri')})`,
        `git add ${files}`,
        `git commit -m "release v${version}"`,
        `git tag -a v${version} -m "v${version}"`,
        `git push origin HEAD && git push origin v${version}`,
    ];
    console.log(plan.join('\n'));
    if (dryRun) {
        for (const [file, text] of originals) {
            writeFileSync(join(root, file), text);
        }
        console.log('release: dry-run, files restored');
        return;
    }
    execSync('cargo update -p desktop', {
        cwd: join(root, 'apps/desktop/src-tauri'),
        stdio: 'inherit',
    });
    git(`add ${files}`);
    git(`commit -m "release v${version}"`);
    git(`tag -a v${version} -m "v${version}"`);
    git('push origin HEAD');
    git(`push origin v${version}`);
}

main();
