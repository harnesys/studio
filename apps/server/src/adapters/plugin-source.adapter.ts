import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { CatalogInstallSource } from 'harnesys/plugins-catalog';
import { ValidationError } from '../domain/studio.error.ts';

const ARCHIVE_MAX_BYTES = 256 * 1024 * 1024;
const ARCHIVE_FETCH_TIMEOUT_MS = 60000;
const ARCHIVE_MAX_REDIRECTS = 5;
const NPM_TIMEOUT_MS = 120000;
const DEPS_INSTALL_TIMEOUT_MS = 60000;
export type RemoteCatalogSource = Extract<
  CatalogInstallSource,
  {
    type: 'npm' | 'archive';
  }
>;
export type MaterializeSourceRequest = {
  source: RemoteCatalogSource;
  dest: string;
};
export type MaterializeSourceResult = {
  revision?: string;
};
export async function materializeSource(
  request: MaterializeSourceRequest,
): Promise<MaterializeSourceResult> {
  if (existsSync(request.dest)) {
    throw new ValidationError(`materialize destination exists: ${request.dest}`);
  }
  return request.source.type === 'npm'
    ? await materializeNpm(request.source, request.dest)
    : await materializeArchive(request.source, request.dest);
}
export async function installPluginDependencies(checkout: string): Promise<boolean> {
  if (!existsSync(join(checkout, 'package.json'))) {
    return true;
  }
  const hasLockfile =
    existsSync(join(checkout, 'bun.lock')) ||
    existsSync(join(checkout, 'bun.lockb')) ||
    existsSync(join(checkout, 'package-lock.json'));
  if (!hasLockfile) {
    return true;
  }
  const res = await spawnCommand(['bun', 'install', '--ignore-scripts'], {
    cwd: checkout,
    timeoutMs: DEPS_INSTALL_TIMEOUT_MS,
  });
  return res.code === 0;
}
async function materializeNpm(
  source: Extract<
    CatalogInstallSource,
    {
      type: 'npm';
    }
  >,
  dest: string,
): Promise<MaterializeSourceResult> {
  const work = `${dest}__npm`;
  rmRecursive(work);
  try {
    mkdirSync(work, { recursive: true });
    writeFileSync(
      join(work, 'package.json'),
      `${JSON.stringify({ name: 'harnesys-plugin-materialize', private: true }, null, 2)}\n`,
      'utf8',
    );
    const args = ['add', specFromNpmSource(source), '--no-save', '--ignore-scripts'];
    if (source.registry) {
      args.push('--registry', source.registry);
    }
    const res = await spawnCommand(['bun', ...args], { cwd: work, timeoutMs: NPM_TIMEOUT_MS });
    if (res.code !== 0) {
      throw new ValidationError(`bun add failed: ${(res.stderr || res.stdout).trim()}`);
    }
    const pkgDir = containedNpmPackageDir(work, source.package);
    const revision = readNpmPackageVersion(pkgDir);
    mkdirSync(join(dest, '..'), { recursive: true });
    cpSync(pkgDir, dest, { recursive: true });
    return { ...(revision ? { revision } : {}) };
  } finally {
    rmRecursive(work);
  }
}
function specFromNpmSource(
  source: Extract<
    CatalogInstallSource,
    {
      type: 'npm';
    }
  >,
): string {
  return source.version ? `${source.package}@${source.version}` : source.package;
}
function containedNpmPackageDir(work: string, pkg: string): string {
  const nodeModules = resolve(work, 'node_modules');
  const pkgDir = resolve(nodeModules, pkg);
  if (!pkgDir.startsWith(`${nodeModules}/`) || !existsSync(join(pkgDir, 'package.json'))) {
    throw new ValidationError(`npm package not found after install: ${pkg}`);
  }
  return pkgDir;
}
function readNpmPackageVersion(pkgDir: string): string | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    if (typeof raw !== 'object' || raw === null) {
      return undefined;
    }
    const version = (raw as Record<string, unknown>).version;
    return typeof version === 'string' && version.length > 0 ? version : undefined;
  } catch {
    return undefined;
  }
}
async function materializeArchive(
  source: Extract<
    CatalogInstallSource,
    {
      type: 'archive';
    }
  >,
  dest: string,
): Promise<MaterializeSourceResult> {
  const zipPath = `${dest}__archive.zip`;
  const extractDir = `${dest}__unzip`;
  rmRecursive(extractDir);
  try {
    const bytes = await downloadArchive(source.url);
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(bytes);
    const digest = hasher.digest('hex');
    if (source.sha256 && digest.toLowerCase() !== source.sha256.toLowerCase()) {
      throw new ValidationError(`archive sha256 mismatch for ${source.url}`);
    }
    mkdirSync(extractDir, { recursive: true });
    writeFileSync(zipPath, bytes);
    await extractZip(zipPath, extractDir);
    const pluginRoot = locateArchivePluginRoot(extractDir);
    mkdirSync(join(dest, '..'), { recursive: true });
    cpSync(pluginRoot, dest, { recursive: true });
    return { revision: digest.slice(0, 12) };
  } finally {
    rmRecursive(zipPath);
    rmRecursive(extractDir);
  }
}
async function downloadArchive(url: string): Promise<Uint8Array> {
  let current = url;
  for (let hop = 0; hop <= ARCHIVE_MAX_REDIRECTS; hop += 1) {
    assertHttpsUrl(current);
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(ARCHIVE_FETCH_TIMEOUT_MS),
    });
    if (isRedirect(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new ValidationError(`archive redirect without location: ${current}`);
      }
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      throw new ValidationError(`archive download failed (${response.status}): ${url}`);
    }
    return readCappedBody(response);
  }
  throw new ValidationError(`too many redirects downloading ${url}`);
}
function assertHttpsUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new ValidationError(`archive url must be https: ${url}`);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(`invalid archive url: ${url}`);
  }
}
function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
async function readCappedBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > ARCHIVE_MAX_BYTES) {
    throw new ValidationError(`archive exceeds ${ARCHIVE_MAX_BYTES} bytes`);
  }
  const body = response.body;
  if (!body) {
    throw new ValidationError('archive response has no body');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > ARCHIVE_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ValidationError(`archive exceeds ${ARCHIVE_MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
async function extractZip(zipPath: string, extractDir: string): Promise<void> {
  const args =
    process.platform === 'darwin'
      ? ['ditto', '-x', '-k', zipPath, extractDir]
      : ['unzip', '-q', zipPath, '-d', extractDir];
  const res = await spawnCommand(args, { timeoutMs: ARCHIVE_FETCH_TIMEOUT_MS });
  if (res.code !== 0) {
    throw new ValidationError(`archive extraction failed: ${(res.stderr || res.stdout).trim()}`);
  }
}
function locateArchivePluginRoot(extractDir: string): string {
  if (existsSync(join(extractDir, '.claude-plugin'))) {
    return extractDir;
  }
  const folders = readdirSync(extractDir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name !== '__MACOSX')
    .map((item) => join(extractDir, item.name))
    .filter((dir) => existsSync(join(dir, '.claude-plugin')));
  if (folders.length !== 1) {
    throw new ValidationError(
      'archive must contain .claude-plugin at root or in one top-level folder',
    );
  }
  const root = folders[0];
  if (!root) {
    throw new ValidationError(
      'archive must contain .claude-plugin at root or in one top-level folder',
    );
  }
  return root;
}
function rmRecursive(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
type SpawnCommandRequest = {
  cwd?: string;
  timeoutMs: number;
};
type SpawnCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};
async function spawnCommand(
  args: string[],
  request: SpawnCommandRequest,
): Promise<SpawnCommandResult> {
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn(args, {
      cwd: request.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    throw new ValidationError(`failed to run ${args[0] ?? 'command'}: ${String(err)}`);
  }
  const timeout = setTimeout(() => {
    try {
      proc?.kill();
    } catch {}
  }, request.timeoutMs);
  try {
    const stdout =
      proc.stdout != null && typeof proc.stdout !== 'number'
        ? await new Response(proc.stdout as ReadableStream).text()
        : '';
    const stderr =
      proc.stderr != null && typeof proc.stderr !== 'number'
        ? await new Response(proc.stderr as ReadableStream).text()
        : '';
    const code = await proc.exited;
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}
