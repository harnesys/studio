import { execSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

const VERSION_FILES = [
    'apps/desktop/package.json',
    'apps/desktop/src-tauri/tauri.conf.json',
    'apps/server/package.json',
    'apps/webui/package.json',
    'apps/cli/package.json',
] as const;

const CARGO_TOML = 'apps/desktop/src-tauri/Cargo.toml';
const CARGO_LOCK = 'apps/desktop/src-tauri/Cargo.lock';
const BODY_PATH = join(root, '.git', 'HARNESYS_TAG_EDITMSG');

function fail(message: string): never {
    console.error(`release: ${message}`);
    process.exit(1);
}

function git(command: string): string {
    return execSync(`git ${command}`, { cwd: root, encoding: 'utf8' }).trim();
}

function restore(originals: Map<string, string>): void {
    for (const [file, text] of originals) {
        writeFileSync(join(root, file), text);
    }
}

function changelog(): string {
    const prev = git('tag --sort=-v:refname').split('\n').filter(Boolean)[0];
    let body = "## What's Changed\n";
    if (prev) {
        const commits = git(`log --no-merges --format='- %s' ${prev}..HEAD`)
            .split('\n')
            .filter((line) => line !== '' && !line.startsWith('- release v'));
        body += `${commits.join('\n')}\n`;
    }
    return body;
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
        `git tag -a v${version} -F ${BODY_PATH}`,
        `git push origin HEAD && git push origin v${version}`,
    ];
    writeFileSync(BODY_PATH, changelog());
    if (dryRun) {
        console.log(`\n${readFileSync(BODY_PATH, 'utf8')}`);
        console.log(plan.join('\n'));
        unlinkSync(BODY_PATH);
        restore(originals);
        console.log('release: dry-run, files restored');
        return;
    }
    execSync(`${process.env.EDITOR ?? 'vi'} "${BODY_PATH}"`, {
        cwd: root,
        stdio: 'inherit',
    });
    const body = readFileSync(BODY_PATH, 'utf8').trim();
    if (body === '') {
        unlinkSync(BODY_PATH);
        restore(originals);
        fail('release notes are empty — files restored');
    }
    console.log(`\n${body}\n`);
    console.log(plan.join('\n'));
    execSync('cargo update -p desktop', {
        cwd: join(root, 'apps/desktop/src-tauri'),
        stdio: 'inherit',
    });
    git(`add ${files}`);
    git(`commit -m "release v${version}"`);
    git(`tag -a v${version} -F ${BODY_PATH}`);
    unlinkSync(BODY_PATH);
    git('push origin HEAD');
    git(`push origin v${version}`);
}

main();
