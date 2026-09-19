import { chmodSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { restartRunningComponents } from './lifecycle.ts';
import { resolveBinDir, SERVER_BIN, WEB_BIN } from './paths.ts';
import { isUnitActive, restartUnit, unitName } from './systemd.ts';

const DEFAULT_REPO = 'harnesys/harnesys';
const GH_API = 'https://api.github.com';
const ASSET_PLATFORM = (() => {
  if (process.platform === 'darwin') {
    return 'darwin';
  }
  return process.platform === 'linux' ? 'linux' : undefined;
})();
const ASSET_ARCH = (() => {
  if (process.arch === 'x64') {
    return 'x64';
  }
  return process.arch === 'arm64' ? 'arm64' : undefined;
})();
type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};
function fail(message: string): never {
  console.error(`harnesys: ${message}`);
  process.exit(1);
}
function assetNameFor(bin: string): string {
  return `${bin}-${ASSET_PLATFORM}-${ASSET_ARCH}`;
}
export async function commandUpdate(repoFlag: string | undefined): Promise<void> {
  const repo =
    repoFlag?.trim() ||
    process.env.HARNESYS_REPO?.trim() ||
    process.env.HARNESYS_UPDATE_REPO?.trim() ||
    DEFAULT_REPO;
  if (!ASSET_PLATFORM || !ASSET_ARCH) {
    fail(`unsupported platform ${process.platform}/${process.arch}`);
  }
  const release = await fetchRelease(repo);
  const binDir = resolveBinDir();
  const assetForServer = findAsset(release.assets, assetNameFor(SERVER_BIN));
  const assetForWeb = findAsset(release.assets, assetNameFor(WEB_BIN));
  const staged: {
    bin: string;
    assetName: string;
    staging: string;
    target: string;
    size: number;
  }[] = [];
  try {
    for (const [bin, asset] of [
      [SERVER_BIN, assetForServer],
      [WEB_BIN, assetForWeb],
    ] as const) {
      const target = join(binDir, bin);
      const staging = `${target}.update-${process.pid}`;
      const bytes = await download(asset.browser_download_url);
      writeFileSync(staging, bytes);
      chmodSync(staging, 0o755);
      staged.push({
        bin,
        assetName: asset.name,
        staging,
        target,
        size: bytes.length,
      });
    }
  } catch (error) {
    for (const item of staged) {
      rmSync(item.staging, { force: true });
    }
    fail(`update aborted, binaries untouched: ${String(error).slice(0, 120)}`);
  }
  for (const item of staged) {
    renameSync(item.staging, item.target);
    console.log(
      `updated ${item.bin} ← ${item.assetName} (${Math.round(item.size / 1024 / 1024)} MiB)`,
    );
  }
  const systemdRestarted: string[] = [];
  for (const name of ['server', 'webui'] as const) {
    if (!isUnitActive(name)) {
      continue;
    }
    if (!restartUnit(name)) {
      fail(`systemctl --user restart ${unitName(name)} failed`);
    }
    systemdRestarted.push(unitName(name));
  }
  const restarted = await restartRunningComponents();
  if (systemdRestarted.length > 0) {
    console.log(`restarted (systemd): ${systemdRestarted.join(', ')}`);
  }
  if (restarted.length > 0) {
    console.log(`restarted: ${restarted.join(', ')}`);
  } else if (systemdRestarted.length === 0) {
    console.log('nothing was running — updated binaries will be used on next `harnesys up`');
  }
}
type Release = {
  assets: ReleaseAsset[];
};
async function fetchRelease(repo: string): Promise<Release> {
  let response: Response;
  try {
    response = await fetch(`${GH_API}/repos/${repo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'harnesys-cli' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    fail(`cannot reach ${GH_API}: ${String(error).slice(0, 120)}`);
  }
  if (response.status === 404) {
    fail(`no releases published in ${repo} yet`);
  }
  if (!response.ok) {
    fail(`GitHub API error ${response.status} for ${repo}`);
  }
  const body = (await response.json()) as Partial<Release>;
  if (!Array.isArray(body.assets)) {
    fail(`release in ${repo} has no assets`);
  }
  return { assets: body.assets };
}
function findAsset(assets: ReleaseAsset[], name: string): ReleaseAsset {
  const asset = assets.find((candidate) => candidate.name === name);
  if (!asset) {
    fail(
      `no asset "${name}" in the latest release — available: ${assets.map((a) => a.name).join(', ') || 'none'}`,
    );
  }
  return asset;
}
async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'harnesys-cli' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`download failed with HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
