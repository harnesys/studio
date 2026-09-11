# Skills.sh Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Skills получает вкладку Marketplace: поиск по каталогу skills.sh и установка скилов в workspace или host, с lock-файлом provenance и GitHub fallback.

**Architecture:** Всё в Studio (host). Серверный адаптер ходит в анонимные legacy-эндпоинты `skills.sh/api/search` и `api/download`, при отказе получает файлы через GitHub trees/raw/clone. Скилы пишутся как файловые снапшоты в существующие skill-директории, provenance — в `skills-lock.json`. Клиент — новый feature-слайс + вторая вкладка в `skills-pane.tsx`. `packages/harnesys` не меняется.

**Tech Stack:** Bun + Hono + zod (server), React + TanStack Query v5 + base-ui (client), `@harnesys/studio-shared` контракты.

**Spec:** `docs/superpowers/specs/2026-09-11-skillsh-marketplace-design.md`

## Global Constraints

- Тесты запрещены (AGENTS.md): не создавать `*.test.ts`, не ставить vitest. Верификация каждого таска — `curl`/`bun -e`/agent-browser, как указано в шагах.
- Дев-стенд хоста: API `localhost:3000`, Vite `localhost:5173`; сервер обычно уже запущен (`bun --watch`), второй не поднимать, чужие процессы не убивать. Порты заняты — работать с ними; свободны — спросить человека.
- `exactOptionalPropertyTypes` активен: опциональные поля собирать условным спредом `...(x !== undefined ? { x } : {})`, как во всём существующем коде.
- Импорты сервера — с расширением `.ts`; клиентские слои — только вниз по FSD, слайс снаружи через `index.ts`.
- Линт: `bun run lint` в корне монорепо после каждого таска, коммит только чистого.
- slug папки скила проверять regex `^[a-z0-9][a-z0-9._-]{0,79}$`; имена файлов из снапшота пропускать проверку path traversal (`resolve` внутри целевой директории).
- Metadata из API (name/description) очищать от escape/control-последовательностей перед выводом (`sanitizeMetadata`, Таск 2).
- Commit message: `feat: <что>` / `chore: <что>`,.stage только файлы таска.

---

### Task 1: Shared контракты

**Files:**
- Create: `apps/studio/shared/src/skill-market.ts`
- Modify: `apps/studio/shared/types.ts` (добавить export-блок в конец секции экспортов)

**Interfaces:**
- Produces: `SkillMarketScope`, `MarketplaceSkillResult`, `SkillMarketSearchResponse`, `MarketplaceInstalledSkill`, `SkillMarketInstalledResponse`, `InstallMarketplaceSkillRequest`, `SkillMarketSkillResponse`, `MarketplaceSkillUpdate`, `SkillMarketUpdatesResponse`, `CheckMarketplaceUpdatesRequest`, `UpdateMarketplaceSkillRequest`, `RemoveMarketplaceSkillRequest` — используют все последующие таски.

- [ ] **Step 1: Создать `apps/studio/shared/src/skill-market.ts`**

```ts
export type SkillMarketScope = 'workspace' | 'host';

export type MarketplaceSkillResult = {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  url: string;
};

export type SkillMarketSearchResponse = {
  results: MarketplaceSkillResult[];
};

export type MarketplaceInstalledSkill = {
  slug: string;
  id: string;
  name: string;
  source: string;
  skillPath: string;
  contentHash: string;
  installedAt: string;
};

export type SkillMarketInstalledResponse = {
  skills: MarketplaceInstalledSkill[];
};

export type InstallMarketplaceSkillRequest = {
  id: string;
  scope: SkillMarketScope;
  workspaceId?: string;
};

export type SkillMarketSkillResponse = {
  skill: MarketplaceInstalledSkill;
};

export type MarketplaceSkillUpdate = {
  slug: string;
  id: string;
  currentHash: string;
  latestHash: string;
};

export type SkillMarketUpdatesResponse = {
  updates: MarketplaceSkillUpdate[];
};

export type CheckMarketplaceUpdatesRequest = {
  scope: SkillMarketScope;
  workspaceId?: string;
};

export type UpdateMarketplaceSkillRequest = {
  slug: string;
  scope: SkillMarketScope;
  workspaceId?: string;
};

export type RemoveMarketplaceSkillRequest = {
  slug: string;
  scope: SkillMarketScope;
  workspaceId?: string;
};
```

- [ ] **Step 2: Экспортировать из barrel `apps/studio/shared/types.ts`**

В конец файла добавить:

```ts
export type {
  CheckMarketplaceUpdatesRequest,
  InstallMarketplaceSkillRequest,
  MarketplaceInstalledSkill,
  MarketplaceSkillResult,
  MarketplaceSkillUpdate,
  RemoveMarketplaceSkillRequest,
  SkillMarketInstalledResponse,
  SkillMarketScope,
  SkillMarketSearchResponse,
  SkillMarketSkillResponse,
  SkillMarketUpdatesResponse,
  UpdateMarketplaceSkillRequest,
} from './src/skill-market.ts';
```

- [ ] **Step 3: Проверить типы сервера и клиента**

Run: `bunx tsc --noEmit -p apps/studio/server/tsconfig.json && bunx tsc --noEmit -p apps/studio/client/tsconfig.json` (если tsconfig проекта не позволяет standalone-прогон — открыть любой файл shared в редакторе IDE-free: `bun build apps/studio/shared/types.ts --target=bun >/dev/null`)
Expected: ошибок по `skill-market` нет.

- [ ] **Step 4: Linт + commit**

```bash
bun run lint
git add apps/studio/shared/src/skill-market.ts apps/studio/shared/types.ts
git commit -m "feat: add skill market shared contracts"
```

---

### Task 2: Skills.sh adapter (search/download/hash/sanitize)

**Files:**
- Modify: `apps/studio/server/src/config/env.ts` (поля `skillshApiUrl`, `skillshDownloadUrl`)
- Create: `apps/studio/server/src/adapters/skillsh/skillsh.adapter.ts`
- Create: `apps/studio/server/src/adapters/skillsh/snapshot-hash.ts`
- Create: `apps/studio/server/src/adapters/skillsh/sanitize.ts`

**Interfaces:**
- Consumes: `env` из `../../config/env.ts`.
- Produces:
  - `type SkillShSearchItem = { id: string; skillId: string; name: string; installs: number; source: string }`
  - `type SkillSnapshotFile = { path: string; contents: string }`, `type SkillSnapshot = { files: SkillSnapshotFile[]; hash: string | null }`
  - `searchSkills(query: string, opts?: { owner?: string; limit?: number }): Promise<SkillShSearchItem[]>`
  - `downloadSkillSnapshot(owner: string, repo: string, slug: string): Promise<SkillSnapshot | null>`
  - `computeSnapshotHash(files: SkillSnapshotFile[]): string`
  - `sanitizeMetadata(text: string): string`, `toSkillSlug(value: string): string`

- [ ] **Step 1: Добавить env-переопределения в `env.ts`**

В объект `env` после `bundledSkills` добавить две строки:

```ts
  skillshApiUrl: process.env.HARNESYS_SKILLSSH_API_URL?.trim() || 'https://skills.sh',
  skillshDownloadUrl: process.env.HARNESYS_SKILLSSH_DOWNLOAD_URL?.trim() || 'https://skills.sh',
```

- [ ] **Step 2: Создать `snapshot-hash.ts`**

```ts
import { createHash } from 'node:crypto';

export type SkillSnapshotFile = { path: string; contents: string };

export function computeSnapshotHash(files: SkillSnapshotFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update(file.contents);
  }
  return hash.digest('hex');
}
```

Формула копирует `computeSnapshotHash` из vercel-labs/skills `src/blob.ts`, поэтому локальный хэш сравним с полем `hash` ответа `/api/download`.

- [ ] **Step 3: Создать `sanitize.ts`**

```ts
const OSC_RE = /\x1b\][\s\S]*?(?:\u0007|\x1b\\)/g;
const CSI_RE = /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g;
const SIMPLE_ESC_RE = /\x1b[\x20-\x7e]/g;
const C1_RE = /[\u0080-\u009f]/g;
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/g;

export function sanitizeMetadata(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(CSI_RE, '')
    .replace(SIMPLE_ESC_RE, '')
    .replace(C1_RE, '')
    .replace(CONTROL_RE, '')
    .trim();
}

export function toSkillSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 80);
}
```

`CONTROL_RE` сохраняет `\t` и `\n`.

- [ ] **Step 4: Создать `skillsh.adapter.ts`**

```ts
import { env } from '../../config/env.ts';
import type { SkillSnapshot, SkillSnapshotFile } from './snapshot-hash.ts';

export type { SkillSnapshot, SkillSnapshotFile } from './snapshot-hash.ts';

export type SkillShSearchItem = {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
};

const FETCH_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [500, 1500];

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      if (![403, 429, 500, 502, 503, 504].includes(response.status)) {
        return null;
      }
    } catch {
      // timeout / network: retry below
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return null;
}

export async function searchSkills(
  query: string,
  options: { owner?: string; limit?: number } = {},
): Promise<SkillShSearchItem[]> {
  const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 50) });
  if (options.owner) {
    params.set('owner', options.owner);
  }
  const url = `${env.skillshApiUrl}/api/search?${params.toString()}`;
  const data = await fetchJson<{ skills?: SkillShSearchItem[] }>(url);
  return data?.skills ?? [];
}

export async function downloadSkillSnapshot(
  owner: string,
  repo: string,
  slug: string,
): Promise<SkillSnapshot | null> {
  const url =
    `${env.skillshDownloadUrl}/api/download/` +
    `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(slug)}`;
  const data = await fetchJson<{ files?: SkillSnapshotFile[]; hash?: string | null }>(url);
  if (!data?.files || data.files.length === 0) {
    return null;
  }
  return { files: data.files, hash: data.hash ?? null };
}
```

- [ ] **Step 5: Живая проверка (стенд не нужен, импорт прямой)**

```bash
cd apps/studio/server && bun -e '
const { searchSkills, downloadSkillSnapshot } = await import("./src/adapters/skillsh/skillsh.adapter.ts");
const { computeSnapshotHash } = await import("./src/adapters/skillsh/snapshot-hash.ts");
const items = await searchSkills("react", { limit: 3 });
console.log("search:", items.length, items[0]?.id);
const snap = await downloadSkillSnapshot("vercel-labs", "agent-skills", "vercel-react-best-practices");
console.log("download:", snap?.files.length, "hash-equal:", snap ? computeSnapshotHash(snap.files) === snap.hash : "n/a");
'
```

Expected: `search: 3 vercel-labs/agent-skills/...`, `hash-equal: true`. Если WAF отдал пустой массив — повторить через минуту (переходящее состояние, spec «Verified behavior»).

- [ ] **Step 6: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/config/env.ts apps/studio/server/src/adapters/skillsh
git commit -m "feat: add skills.sh API adapter with snapshot hash"
```

---

### Task 3: GitHub fallback

**Files:**
- Create: `apps/studio/server/src/adapters/skillsh/github-fallback.ts`

**Interfaces:**
- Consumes: `SkillSnapshot`, `SkillSnapshotFile` (Task 2), `clonePlugin`, `removePluginPath` из `../plugin-git.adapter.ts`.
- Produces: `fetchSkillFromGithub(source: string, slug: string): Promise<SkillSnapshot | null>` — для `source = "owner/repo"`; trees/raw, при неудаче shallow clone во временную папку.

- [ ] **Step 1: Создать `github-fallback.ts`**

Реализация (полный файл, три функции):

```ts
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, sep } from 'node:path';
import { clonePlugin, removePluginPath } from '../plugin-git.adapter.ts';
import type { SkillSnapshot, SkillSnapshotFile } from './snapshot-hash.ts';
import { toSkillSlug } from './sanitize.ts';

const FETCH_TIMEOUT_MS = 10_000;
const GH_HEADERS = { 'user-agent': 'harnesys-studio', accept: 'application/vnd.github+json' };

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: GH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type TreeEntry = { type: string; path: string };

export async function fetchSkillFromGithub(
  source: string,
  slug: string,
): Promise<SkillSnapshot | null> {
  const [owner, repo] = source.split('/');
  if (!owner || !repo) {
    return null;
  }
  const repoInfo = await fetchJson<{ default_branch?: string }>(
    `https://api.github.com/repos/${owner}/${repo}`,
  );
  const branch = repoInfo?.default_branch ?? 'main';
  const tree = await fetchJson<{ truncated?: boolean; tree?: TreeEntry[] }>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  const entries = tree?.tree;
  if (entries && tree?.truncated !== true) {
    const viaApi = await collectFromTree(owner, repo, branch, entries, slug);
    if (viaApi) {
      return viaApi;
    }
  }
  return fetchViaClone(source, slug);
}

async function collectFromTree(
  owner: string,
  repo: string,
  branch: string,
  entries: TreeEntry[],
  slug: string,
): Promise<SkillSnapshot | null> {
  const target = toSkillSlug(slug);
  const skillMd = entries.find((entry) => {
    if (entry.type !== 'blob' || !posix.basename(entry.path).toLowerCase().endsWith('skill.md')) {
      return false;
    }
    const folder = posix.basename(posix.dirname(entry.path));
    return toSkillSlug(folder) === target;
  });
  if (!skillMd) {
    return null;
  }
  const folderPath = posix.dirname(skillMd.path);
  const files: SkillSnapshotFile[] = [];
  for (const entry of entries) {
    if (entry.type !== 'blob' || !entry.path.startsWith(`${folderPath}/`)) {
      continue;
    }
    const rel = entry.path.slice(folderPath.length + 1);
    const text = await fetchText(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${entry.path}`,
    );
    if (text !== null) {
      files.push({ path: rel, contents: text });
    }
  }
  return files.some((file) => file.path.toLowerCase().endsWith('skill.md'))
    ? { files, hash: null }
    : null;
}

async function fetchViaClone(source: string, slug: string): Promise<SkillSnapshot | null> {
  const dest = await mkdtemp(join(tmpdir(), 'harnesys-skill-'));
  try {
    await clonePlugin({ source: `https://github.com/${source}.git`, dest });
    const target = toSkillSlug(slug);
    const folder = await findSkillFolder(dest, target);
    if (!folder) {
      return null;
    }
    const files: SkillSnapshotFile[] = [];
    for (const relPath of await walkFiles(folder)) {
      if (relPath.split(sep).includes('.git')) {
        continue;
      }
      const contents = await readFile(join(folder, relPath), 'utf8').catch(() => null);
      if (contents !== null) {
        files.push({
          path: relPath.split(sep).join('/'),
          contents: contents.includes('\u0000') ? '' : contents,
        });
      }
    }
    return files.length > 0 ? { files, hash: null } : null;
  } catch {
    return null;
  } finally {
    await rm(dest, { recursive: true, force: true }).catch(() => undefined);
    await removePluginPath(dest).catch(() => undefined);
  }
}

async function findSkillFolder(root: string, slugTarget: string): Promise<string | null> {
  for (const dir of await walkDirs(root)) {
    const entries = await readdir(dir);
    if (
      entries.some((name) => name.toLowerCase() === 'skill.md') &&
      toSkillSlug(dir.split(sep).at(-1) ?? '') === slugTarget
    ) {
      return dir;
    }
  }
  return null;
}

async function walkDirs(root: string, depth = 4): Promise<string[]> {
  if (depth < 0) {
    return [];
  }
  const out: string[] = [];
  async function walk(dir: string, level: number): Promise<void> {
    if (level > depth) {
      return;
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '.git') {
        const full = join(dir, entry.name);
        out.push(full);
        await walk(full, level + 1);
      }
    }
  }
  await walk(root, 0);
  return out;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string, prefix: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), rel);
      } else if (entry.isFile()) {
        out.push(rel.split('/').join(sep));
      }
    }
  }
  await walk(dir, '');
  return out;
}
```

Замечания по реализации: `walkFiles` возвращает пути с нативным сепаратором, в снапшот класть posix-пути; файлы с NUL-байтом пишутся пустыми строками (бинарные ассеты в v1 не переносятся, SKILL.md при этом сохраняется). `clonePlugin` имеет сигнатуру `{ source, dest, ref? }` (`plugin-git.adapter.ts:1-12`).

- [ ] **Step 2: Живая проверка fallback без skills.sh**

```bash
cd apps/studio/server && bun -e '
const { fetchSkillFromGithub } = await import("./src/adapters/skillsh/github-fallback.ts");
const snap = await fetchSkillFromGithub("vercel-labs/agent-skills", "vercel-react-best-practices");
console.log("github fallback:", snap?.files.length ?? null, snap?.files.some(f => f.path.toLowerCase().endsWith("skill.md")));
'
```

Expected: положительное число файлов, `true`. При rate-limit GitHub (60/ч без токена) — повторить позже или прогнать через clone-путь, результат идентичен.

- [ ] **Step 3: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/adapters/skillsh/github-fallback.ts
git commit -m "feat: add GitHub fallback fetcher for skills.sh installs"
```

---

### Task 4: Lock-store и доменная ошибка

**Files:**
- Create: `apps/studio/server/src/adapters/skillsh/marketplace-lock.ts`
- Modify: `apps/studio/server/src/domain/studio.error.ts` (добавить `MarketplaceUnavailableError`)
- Modify: `apps/studio/server/src/adapters/http/http.error.ts` (маппинг 502)

**Interfaces:**
- Consumes: `studioDir`, `workspaceSkillsPath`, `systemSkillsPath` из `../store/studio-layout.ts`.
- Produces:
  - `type MarketplaceSkillEntry` (поля как `MarketplaceInstalledSkill`, тот же shape — переэкспортировать из shared нельзя, server importует тип из `@harnesys/studio-shared`)
  - `marketplaceDirs(home: string, workspacePath?: string): { skillsDir: string; lockFile: string }`
  - `readMarketplaceLock(lockFile: string): Promise<{ version: 1; skills: Record<string, MarketplaceSkillEntry> }>`
  - `writeMarketplaceLock(lockFile: string, entries: Record<string, MarketplaceSkillEntry>): Promise<void>`
  - `class MarketplaceUnavailableError extends Error`

- [ ] **Step 1: `marketplace-lock.ts`**

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MarketplaceInstalledSkill } from '@harnesys/studio-shared';
import { studioDir, systemSkillsPath, workspaceSkillsPath } from '../store/studio-layout.ts';

export type MarketplaceSkillEntry = MarketplaceInstalledSkill;
export type MarketplaceSkillLockFile = {
  version: 1;
  skills: Record<string, MarketplaceSkillEntry>;
};

export function marketplaceDirs(
  home: string,
  workspacePath?: string,
): { skillsDir: string; lockFile: string } {
  if (workspacePath) {
    const skillsDir = workspaceSkillsPath(workspacePath);
    return { skillsDir, lockFile: join(studioDir(workspacePath), 'skills-lock.json') };
  }
  const skillsDir = systemSkillsPath(home);
  return { skillsDir, lockFile: join(home, 'skills-lock.json') };
}

export async function readMarketplaceLock(lockFile: string): Promise<MarketplaceSkillLockFile> {
  try {
    const parsed = JSON.parse(await readFile(lockFile, 'utf8')) as Partial<MarketplaceSkillLockFile>;
    if (!parsed || typeof parsed.skills !== 'object' || parsed.skills === null) {
      return { version: 1, skills: {} };
    }
    return { version: 1, skills: parsed.skills };
  } catch {
    return { version: 1, skills: {} };
  }
}

export async function writeMarketplaceLock(
  lockFile: string,
  entries: Record<string, MarketplaceSkillEntry>,
): Promise<void> {
  const sorted: Record<string, MarketplaceSkillEntry> = {};
  for (const key of Object.keys(entries).sort()) {
    const entry = entries[key];
    if (entry) {
      sorted[key] = entry;
    }
  }
  await mkdir(dirname(lockFile), { recursive: true });
  const tmp = `${lockFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ version: 1, skills: sorted }, null, 2)}\n`, 'utf8');
  await rename(tmp, lockFile);
}
```

- [ ] **Step 2: Ошибка + маппинг**

`domain/studio.error.ts`, после `ConflictError`:

```ts
export class MarketplaceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketplaceUnavailableError';
  }
}
```

`adapters/http/http.error.ts`: импортировать `MarketplaceUnavailableError`, в `toStudioError` перед `HTTPException`-веткой добавить:

```ts
  if (err instanceof MarketplaceUnavailableError) {
    return { status: 502, error: err.message };
  }
```

- [ ] **Step 3: Проверка round-trip**

```bash
cd apps/studio/server && bun -e '
const { writeMarketplaceLock, readMarketplaceLock } = await import("./src/adapters/skillsh/marketplace-lock.ts");
const file = `${process.env.HOME}/.harnesys/tmp/test-lock/skills-lock.json`;
await writeMarketplaceLock(file, { zz: { slug:"zz", id:"a/b/zz", name:"z", source:"a/b", skillPath:"", contentHash:"h1", installedAt:"2026-09-11T00:00:00Z" }, aa: { slug:"aa", id:"a/b/aa", name:"a", source:"a/b", skillPath:"skills/aa", contentHash:"h2", installedAt:"2026-09-11T00:00:00Z" } });
const lock = await readMarketplaceLock(file);
console.log("keys sorted:", Object.keys(lock.skills).join(","));
'
```

Expected: `keys sorted: aa,zz` (ключи сортируются при записи; при чтении порядок JSON сохраняется).

- [ ] **Step 4: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/adapters/skillsh/marketplace-lock.ts apps/studio/server/src/domain/studio.error.ts apps/studio/server/src/adapters/http/http.error.ts
git commit -m "feat: add marketplace lock store and 502 error"
```

---

### Task 5: Use-cases discover/installed + общий install pipeline

**Files:**
- Create: `apps/studio/server/src/application/skill-market/write-marketplace-skill.ts`
- Create: `apps/studio/server/src/application/skill-market/discover-marketplace-skills.use-case.ts`
- Create: `apps/studio/server/src/application/skill-market/list-installed-skills.use-case.ts`

**Interfaces:**
- Consumes: адаптеры Task 2-4, `ConflictError`/`ValidationError`/`MarketplaceUnavailableError`, `workspaces: WorkspaceRepository` (domain/workspace.port.ts).
- Produces:
  - `writeMarketplaceSkill(args: { id: string; slug: string; name: string; source: string; skillPath: string; skillsDir: string; lockFile: string; force: boolean }): Promise<MarketplaceSkillEntry>` — скачивает снапшот (download → GitHub fallback), валидирует, tmp→swap, пишет lock. Используется install/update-тасками (Task 6).
  - `DiscoverMarketplaceSkillsInput`, `ListInstalledSkillsInput` (Request/Response в том же файле по конвенции).

- [ ] **Step 1: `write-marketplace-skill.ts`**

Ключевые шаги функции (полный код писать по этим требованиям):

```ts
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { MarketplaceInstalledSkill } from '@harnesys/studio-shared';
import { downloadSkillSnapshot } from '../../adapters/skillsh/skillsh.adapter.ts';
import type { SkillSnapshotFile } from '../../adapters/skillsh/snapshot-hash.ts';
import { computeSnapshotHash } from '../../adapters/skillsh/snapshot-hash.ts';
import { fetchSkillFromGithub } from '../../adapters/skillsh/github-fallback.ts';
import {
  marketplaceDirs,
  readMarketplaceLock,
  writeMarketplaceLock,
} from '../../adapters/skillsh/marketplace-lock.ts';
import { toSkillSlug } from '../../adapters/skillsh/sanitize.ts';
import { ConflictError, MarketplaceUnavailableError, ValidationError } from '../../domain/studio.error.ts';
```

1. `parseMarketplaceId(id)` (экспортировать отсюда): разбить `owner/repo/slug` по первым двум слэшам, вернуть `{ owner, repo, slug } | null`.
2. Снапшот: `await downloadSkillSnapshot(owner, repo, slug) ?? await fetchSkillFromGithub(\`${owner}/${repo}\`, slug)`; `null` → `throw new MarketplaceUnavailableError('marketplace is unavailable for this skill')`.
3. Валидация: среди `files` есть путь, чей basename lowercase = `skill.md`; каждый `path` относительный (`!posix.isAbsolute`, нет `..` сегментов после `resolve(dest, path)` проверки `resolved === dest || resolved.startsWith(dest + sep)`), иначе `ValidationError`.
4. Целевая папка: `dest = join(skillsDir, slug)`; если `existsSync(dest)` и slug нет в lock — `ConflictError('skill <slug> already exists')` при `force === false`; при `force === true` swap допустим.
5. Запись: `mkdir(skillsDir, {recursive:true})`, tmp `${dest}.tmp-${Math.random().toString(36).slice(2, 8)}`, файлы писать по поддиректориям (`mkdir(join(tmp, dirname(rel)), {recursive:true})` перед `writeFile`), пересчитать `computeSnapshotHash` и сравнить со снапшот-`hash`, если он не null: расхождение → `rm(tmp)` + `MarketplaceUnavailableError('snapshot hash mismatch')`.
6. Swap: если `existsSync(dest)` — `rename(dest, \`${dest}.old-${Date.now()}\`)`, затем `rename(tmp, dest)`, `rm(old, {recursive:true,force:true})`; любое исключение после rename в dest откатывать: вернуть old на место и удалить tmp.
7. Lock: прочитать, записать entry `{ slug, id, name, source, skillPath, contentHash, installedAt: new Date().toISOString() }` (при update — перезаписать существующий ключ), сохранить `writeMarketplaceLock`.
8. Вернуть entry.

`name` для lock приходит параметром `args.name`, frontmatter-парсер не поднимается: вызывающий install use-case передаёт slug из API, update use-case — `name` из существующей lock-записи (UI показывает slug+source, согласовано в Task 9).

- [ ] **Step 2: `discover-marketplace-skills.use-case.ts`**

```ts
import type {
  MarketplaceSkillResult,
  SkillMarketSearchResponse,
} from '@harnesys/studio-shared';
import { searchSkills } from '../../adapters/skillsh/skillsh.adapter.ts';
import { sanitizeMetadata, toSkillSlug } from '../../adapters/skillsh/sanitize.ts';
import { ValidationError } from '../../domain/studio.error.ts';

export type DiscoverMarketplaceSkillsRequest = {
  query: string;
  owner?: string;
  limit?: number;
};

export type DiscoverMarketplaceSkillsInput = {
  execute(request: DiscoverMarketplaceSkillsRequest): Promise<SkillMarketSearchResponse>;
};

export class DiscoverMarketplaceSkillsUseCase implements DiscoverMarketplaceSkillsInput {
  async execute(
    request: DiscoverMarketplaceSkillsRequest,
  ): Promise<SkillMarketSearchResponse> {
    const query = request.query.trim();
    if (query.length < 2) {
      throw new ValidationError('query must be at least 2 characters');
    }
    const items = await searchSkills(query, {
      ...(request.owner ? { owner: request.owner } : {}),
      ...(request.limit ? { limit: request.limit } : {}),
    });
    const results: MarketplaceSkillResult[] = items.map((item) => {
      const slug = item.id.startsWith(`${item.source}/`)
        ? item.id.slice(item.source.length + 1)
        : item.skillId;
      return {
        id: item.id,
        slug: toSkillSlug(slug),
        name: sanitizeMetadata(item.name),
        source: item.source,
        installs: item.installs ?? 0,
        url: `https://skills.sh/${item.source}/${slug}`,
      };
    });
    results.sort((a, b) => b.installs - a.installs);
    return { results };
  }
}
```

- [ ] **Step 3: `list-installed-skills.use-case.ts`**

```ts
import type {
  SkillMarketInstalledResponse,
  SkillMarketScope,
} from '@harnesys/studio-shared';
import { marketplaceDirs, readMarketplaceLock } from '../../adapters/skillsh/marketplace-lock.ts';
import { NotFoundError } from '../../domain/studio.error.ts';
import type { WorkspaceRepository } from '../../domain/workspace.port.ts';

export type ListInstalledSkillsRequest = {
  scope: SkillMarketScope;
  workspaceId?: string;
};

export type ListInstalledSkillsInput = {
  execute(request: ListInstalledSkillsRequest): Promise<SkillMarketInstalledResponse>;
};

export class ListInstalledSkillsUseCase implements ListInstalledSkillsInput {
  constructor(
    private readonly workspaces: WorkspaceRepository,
    private readonly home: string,
  ) {}

  async execute(request: ListInstalledSkillsRequest): Promise<SkillMarketInstalledResponse> {
    const workspacePath = this.resolveWorkspacePath(request);
    const { lockFile } = marketplaceDirs(this.home, workspacePath);
    const lock = await readMarketplaceLock(lockFile);
    return { skills: Object.values(lock.skills) };
  }

  private resolveWorkspacePath(request: ListInstalledSkillsRequest): string | undefined {
    if (request.scope === 'host') {
      return undefined;
    }
    const workspace = request.workspaceId
      ? this.workspaces.findById(request.workspaceId)
      : undefined;
    if (!workspace) {
      throw new NotFoundError('workspace not found');
    }
    return workspace.path;
  }
}
```

Такой же `resolveWorkspacePath` переиспользовать в Task 6 (вынести в общий файл `resolve-marketplace-dirs.ts`, если ревьюер потребует DRY; для v1 допустимо скопировать — три строки логики).

- [ ] **Step 4: Проверка discovery против живого API через bun**

```bash
cd apps/studio/server && bun -e '
const { DiscoverMarketplaceSkillsUseCase } = await import("./src/application/skill-market/discover-marketplace-skills.use-case.ts");
const res = await new DiscoverMarketplaceSkillsUseCase().execute({ query: "react", limit: 3 });
console.log(res.results.map(r => `${r.id} (${r.installs})`).join(" | "));
'
```

Expected: три id с убывающими installs. `curl localhost:3000` пока не используется — контроллеры в Task 7.

- [ ] **Step 5: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/application/skill-market
git commit -m "feat: add skill marketplace write pipeline and discovery use cases"
```

---

### Task 6: Use-cases install/updates/update/remove

**Files:**
- Create: `apps/studio/server/src/application/skill-market/install-marketplace-skill.use-case.ts`
- Create: `apps/studio/server/src/application/skill-market/marketplace-updates.use-case.ts`
- Create: `apps/studio/server/src/application/skill-market/update-marketplace-skill.use-case.ts`
- Create: `apps/studio/server/src/application/skill-market/remove-marketplace-skill.use-case.ts`

**Interfaces:**
- Consumes: `writeMarketplaceSkill`/`parseMarketplaceId` (Task 5), `marketplaceDirs`/`readMarketplaceLock`/`writeMarketplaceLock` (Task 4), `downloadSkillSnapshot`/`fetchSkillFromGithub`/`computeSnapshotHash` (Task 2-3), `workspaces: WorkspaceRepository`, `home: string`, `workspaceHarnesys: WorkspaceHarnesysRegistry` — после workspace-scoped изменений вызвать `hx.skills.reload()` как в `reload-workspace-skills.use-case.ts`.
- Produces: `InstallMarketplaceSkillInput`, `MarketplaceUpdatesInput`, `UpdateMarketplaceSkillInput`, `RemoveMarketplaceSkillInput` с Request/Response из контрактов Task 1.

- [ ] **Step 1: install use-case**

Request: `InstallMarketplaceSkillRequest`, Response: `SkillMarketSkillResponse`. Шаги `execute`:

1. `const parsed = parseMarketplaceId(request.id)`; `null` → `ValidationError('id must be owner/repo/slug')`.
2. `const slug = toSkillSlug(parsed.slug)`; пустой или не проходит regex (после slugify `^[a-z0-9]` и длина ≤80 гарантированы `toSkillSlug`) — оставить как есть.
3. Разрешить dirs как в `ListInstalledSkillsUseCase` (scope workspace без существующего workspaceId → `NotFoundError`).
4. `entry = await writeMarketplaceSkill({ id: request.id, slug, name: parsed.slug, source: `${parsed.owner}/${parsed.repo}`, skillPath: '', skillsDir, lockFile, force: false })`. `name`: search-результат в request не передавать, name брать из frontmatter нельзя без парсера — для v1 `name` = исходный slug из API (`parsed.slug`), UI показывает slug и source (согласовано с фронтом в Task 9).
5. Workspace scope: `const workspace = this.workspaces.findById(...); const hx = await this.workspaceHarnesys.get(workspace); await hx.skills.reload();`
6. `return { skill: entry }`.

- [ ] **Step 2: updates use-case**

Request: `CheckMarketplaceUpdatesRequest`, Response: `SkillMarketUpdatesResponse`. Для каждого lock-entry (id вида `owner/repo/slug`; id `github:...` пропускать): `const snap = await downloadSkillSnapshot(...) ?? await fetchSkillFromGithub(source, slug)`; `snap === null` → пропустить запись; `latestHash = snap.hash ?? computeSnapshotHash(snap.files)`; отличается от `entry.contentHash` → добавить `{ slug, id, currentHash, latestHash }`. Ошибки сети на одном элементе не валят весь проход (`try/catch` per entry).

- [ ] **Step 3: update use-case**

Request: `UpdateMarketplaceSkillRequest`, Response: `SkillMarketSkillResponse`. Найти entry по slug в lock (`NotFoundError('skill not installed')`); `parsed = parseMarketplaceId(entry.id)`; `writeMarketplaceSkill({ ...те же поля из entry (name, slug, source, skillPath), force: true })`; reload как в install.

- [ ] **Step 4: remove use-case**

```ts
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
// deps: workspaces, home, workspaceHarnesys — конструктор как у install
async execute(request: RemoveMarketplaceSkillRequest): Promise<void> {
  const workspacePath = /* тот же резолвер scope, что install */;
  const { skillsDir, lockFile } = marketplaceDirs(this.home, workspacePath);
  const lock = await readMarketplaceLock(lockFile);
  if (!lock.skills[request.slug]) {
    throw new NotFoundError(`skill ${request.slug} is not installed from marketplace`);
  }
  await rm(join(skillsDir, request.slug), { recursive: true, force: true });
  delete lock.skills[request.slug];
  await writeMarketplaceLock(lockFile, lock.skills);
  // reload для workspace scope — как в install
}
```

- [ ] **Step 5: Проверка end-to-end на файлах без HTTP (стенд не нужен)**

```bash
cd apps/studio/server && HARNESYS_HOME=$HOME/.harnesys bun -e '
const { InstallMarketplaceSkillUseCase } = await import("./src/application/skill-market/install-marketplace-skill.use-case.ts");
const { ListInstalledSkillsUseCase } = await import("./src/application/skill-market/list-installed-skills.use-case.ts");
const { RemoveMarketplaceSkillUseCase } = await import("./src/application/skill-market/remove-marketplace-skill.use-case.ts");
const { createSqliteConnection } = await import("./src/adapters/store/sqlite/connection.ts");
// если имена модулей store отличаются — взять их из composition/create-store.ts;
// иначе собрать deps напрямую: new InstallMarketplaceSkillUseCase(repoStub, home, registryStub)
const repo = { findById: () => undefined, list: () => [], insert(){}, update(){}, delete(){} };
const install = new InstallMarketplaceSkillUseCase(repo, `${process.env.HOME}/.harnesys`, null);
const res = await install.execute({ id: "vercel-labs/agent-skills/vercel-react-best-practices", scope: "host" });
console.log("installed:", res.skill.slug, res.skill.contentHash.slice(0, 8));
const list = await new ListInstalledSkillsUseCase(repo, `${process.env.HOME}/.harnesys`).execute({ scope: "host" });
console.log("lock has it:", list.skills.some((s) => s.slug === res.skill.slug));
await new RemoveMarketplaceSkillUseCase(repo, `${process.env.HOME}/.harnesys`, null).execute({ slug: res.skill.slug, scope: "host" });
console.log("removed:", !(await import("node:fs")).existsSync(`${process.env.HOME}/.harnesys/skills/${res.skill.slug}`));
'
```

Expected: `installed: vercel-react-best-practices <hex8>`, `lock has it: true`, `removed: true`. Передавать `null` в `workspaceHarnesys` допустимо для host-scope (используется только в workspace-ветке). В рантайме use-case конструктором принимает `workspaceHarnesys: WorkspaceHarnesysRegistry`; типизировать параметр как `WorkspaceHarnesysRegistry | null` и в workspace-ветке кидать `ValidationError('workspace harnesys is not configured')` при null — иначе bun-eval не собрать.

- [ ] **Step 6: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/application/skill-market
git commit -m "feat: add marketplace install, updates, remove use cases"
```

---

### Task 7: HTTP controller + wiring

**Files:**
- Create: `apps/studio/server/src/adapters/http/skill-market/skill-market.controller.ts`
- Create: `apps/studio/server/src/adapters/http/skill-market/skill-market.body.ts`
- Create: `apps/studio/server/src/composition/wire-skill-market-controllers.ts`
- Modify: `apps/studio/server/src/composition/wire-controllers.ts` (импорт + вызов рядом с `wirePluginControllers`)

**Interfaces:**
- Consumes: use-cases Task 5-6 (типы `*Input`).
- Produces: HTTP: `GET /api/skill-market/search`, `GET /api/skill-market/installed`, `POST /api/skill-market/install|updates|update|remove` (contract = Task 1 типы).

- [ ] **Step 1: `skill-market.body.ts`**

```ts
import { z } from 'zod';

export const scopeSchema = z.enum(['workspace', 'host']);

export const installedQuery = z.object({
  scope: scopeSchema,
  workspaceId: z.string().trim().min(1).optional(),
});

export const installMarketplaceSkillBody = z.object({
  id: z.string().trim().min(3),
  scope: scopeSchema,
  workspaceId: z.string().trim().min(1).optional(),
});

export const updatesBody = z.object({
  scope: scopeSchema,
  workspaceId: z.string().trim().min(1).optional(),
});

export const updateMarketplaceSkillBody = z.object({
  slug: z.string().trim().min(1),
  scope: scopeSchema,
  workspaceId: z.string().trim().min(1).optional(),
});

export const removeMarketplaceSkillBody = updateMarketplaceSkillBody;
```

- [ ] **Step 2: `skill-market.controller.ts`**

Следовать форме `plugins.controller.ts`: `SkillMarketControllerDeps = { discover: DiscoverMarketplaceSkillsInput; installed: ListInstalledSkillsInput; install: InstallMarketplaceSkillInput; updates: MarketplaceUpdatesInput; update: UpdateMarketplaceSkillInput; remove: RemoveMarketplaceSkillInput }`, класс с `register(app: Hono)`:

```ts
app.get('/api/skill-market/search', async (c) => {
  const q = c.req.query('q') ?? '';
  const limitRaw = Number(c.req.query('limit'));
  const ownerRaw = c.req.query('owner');
  return c.json(
    await this.deps.discover.execute({
      query: q,
      ...(ownerRaw ? { owner: ownerRaw } : {}),
      ...(Number.isFinite(limitRaw) && limitRaw > 0 ? { limit: limitRaw } : {}),
    }),
  );
});
app.get('/api/skill-market/installed', async (c) => {
  const query = installedQuery.parse({
    scope: c.req.query('scope'),
    ...(c.req.query('workspaceId') ? { workspaceId: c.req.query('workspaceId') } : {}),
  });
  return c.json(await this.deps.installed.execute(query));
});
app.post('/api/skill-market/install', async (c) => {
  const body = installMarketplaceSkillBody.parse(await c.req.json());
  const result = await this.deps.install.execute(body);
  return c.json(result, 201);
});
app.post('/api/skill-market/updates', async (c) => {
  const body = updatesBody.parse(await c.req.json());
  return c.json(await this.deps.updates.execute(body));
});
app.post('/api/skill-market/update', async (c) => {
  const body = updateMarketplaceSkillBody.parse(await c.req.json());
  return c.json(await this.deps.update.execute(body));
});
app.post('/api/skill-market/remove', async (c) => {
  const body = removeMarketplaceSkillBody.parse(await c.req.json());
  await this.deps.remove.execute(body);
  return c.body(null, 204);
});
```

- [ ] **Step 3: `wire-skill-market-controllers.ts`**

По образцу `wire-plugin-controllers.ts`:

```ts
import type { Hono } from 'hono';
import { SkillMarketController } from '../adapters/http/skill-market/skill-market.controller.ts';
import type { SqliteWorkspaceRepo } from '../adapters/store/sqlite/repos/sqlite-workspace.repo.ts';
import type { WorkspaceHarnesysRegistry } from '../adapters/workspace-harnesys.registry.ts';
// импорты use-case классов...

export type WireSkillMarketControllersDeps = {
  app: Hono;
  home: string;
  workspaceRepo: SqliteWorkspaceRepo;
  workspaceHarnesys: WorkspaceHarnesysRegistry;
};

export function wireSkillMarketControllers(d: WireSkillMarketControllersDeps): void {
  new SkillMarketController({
    discover: new DiscoverMarketplaceSkillsUseCase(),
    installed: new ListInstalledSkillsUseCase(d.workspaceRepo, d.home),
    install: new InstallMarketplaceSkillUseCase(d.workspaceRepo, d.home, d.workspaceHarnesys),
    updates: new MarketplaceUpdatesUseCase(d.workspaceRepo, d.home),
    update: new UpdateMarketplaceSkillUseCase(d.workspaceRepo, d.home, d.workspaceHarnesys),
    remove: new RemoveMarketplaceSkillUseCase(d.workspaceRepo, d.home, d.workspaceHarnesys),
  }).register(d.app);
}
```

В `wire-controllers.ts` найти вызов `wirePluginControllers({...})` и рядом добавить `wireSkillMarketControllers({ app, home, workspaceRepo, workspaceHarnesys })`, подставив переменные с теми же именами, что уже передаются в `wirePluginControllers` (в deps-объекте это `d.workspaceRepo`/`workspaceRepo`, `d.workspaceHarnesys`/`workspaceHarnesys`, `home` — из области видимости рядом стоящего вызова).

- [ ] **Step 4: Проверка HTTP на живом дев-сервере**

Бэкенд Studio на `bun --watch` перезапускается сам; если порт 3000 не слушает никто — спросить человека, не поднимать.

```bash
curl -s "http://localhost:3000/api/skill-market/search?q=react&limit=2" | head -c 400
curl -s "http://localhost:3000/api/skill-market/installed?scope=host"
WS=$(curl -s http://localhost:3000/api/workspaces | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST http://localhost:3000/api/skill-market/install -H 'content-type: application/json' \
  -d "{\"id\":\"vercel-labs/agent-skills/vercel-react-best-practices\",\"scope\":\"workspace\",\"workspaceId\":\"$WS\"}"
curl -s "http://localhost:3000/api/skill-market/installed?scope=workspace&workspaceId=$WS"
curl -s -X POST http://localhost:3000/api/skill-market/updates -H 'content-type: application/json' -d '{"scope":"workspace","workspaceId":"'"$WS"'"}'
curl -s -X POST http://localhost:3000/api/skill-market/remove -H 'content-type: application/json' -d '{"slug":"vercel-react-best-practices","scope":"workspace","workspaceId":"'"$WS"'"}'
```

Expected: search отдаёт results; install — 201/200 с `{skill}`, в `<workspace>/.harnesys/skills/vercel-react-best-practices/SKILL.md` файл, `skills-lock.json` с записью; повторный install — 409; updates — `{"updates":[]}`; remove — 204 и папки нет.

- [ ] **Step 5: Linт + commit**

```bash
bun run lint
git add apps/studio/server/src/adapters/http/skill-market apps/studio/server/src/composition
git commit -m "feat: expose skill market HTTP endpoints"
```

---

### Task 8: Клиентские API-обёртки

**Files:**
- Create: `apps/studio/client/src/shared/api/skill-market.ts`
- Modify: `apps/studio/client/src/shared/api/index.ts` (re-export)

**Interfaces:**
- Consumes: `apiJson` (`./client`), контракты `@harnesys/studio-shared`.
- Produces: `skillMarketSearchQuery({q, owner})`/`skillMarketSearchQueryKey`, `skillMarketInstalledQuery(scope, workspaceId)`/`skillMarketInstalledQueryKey`, функции `installMarketplaceSkill`, `checkMarketplaceUpdates`, `updateMarketplaceSkill`, `removeMarketplaceSkill`.

- [ ] **Step 1: `skill-market.ts`** — по форме `shared/api/plugins.ts`:

```ts
import type {
  CheckMarketplaceUpdatesRequest,
  InstallMarketplaceSkillRequest,
  RemoveMarketplaceSkillRequest,
  SkillMarketInstalledResponse,
  SkillMarketScope,
  SkillMarketSearchResponse,
  SkillMarketSkillResponse,
  SkillMarketUpdatesResponse,
  UpdateMarketplaceSkillRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';

import { apiJson } from './client';

export const skillMarketSearchQueryKey = ['skill-market', 'search'] as const;
export const skillMarketInstalledQueryKey = ['skill-market', 'installed'] as const;

export function skillMarketSearchQuery(params: { q: string; owner?: string }) {
  return queryOptions({
    queryKey: [...skillMarketSearchQueryKey, params.q, params.owner ?? ''] as const,
    queryFn: () => {
      const search = new URLSearchParams({ q: params.q, limit: '50' });
      if (params.owner) {
        search.set('owner', params.owner);
      }
      return apiJson<SkillMarketSearchResponse>(`/api/skill-market/search?${search.toString()}`);
    },
    enabled: params.q.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function skillMarketInstalledQuery(scope: SkillMarketScope, workspaceId?: string) {
  return queryOptions({
    queryKey: [...skillMarketInstalledQueryKey, scope, workspaceId ?? ''] as const,
    queryFn: () => {
      const search = new URLSearchParams({ scope });
      if (workspaceId) {
        search.set('workspaceId', workspaceId);
      }
      return apiJson<SkillMarketInstalledResponse>(
        `/api/skill-market/installed?${search.toString()}`,
      );
    },
  });
}

export function installMarketplaceSkill(body: InstallMarketplaceSkillRequest) {
  return apiJson<SkillMarketSkillResponse>('/api/skill-market/install', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function checkMarketplaceUpdates(body: CheckMarketplaceUpdatesRequest) {
  return apiJson<SkillMarketUpdatesResponse>('/api/skill-market/updates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateMarketplaceSkill(body: UpdateMarketplaceSkillRequest) {
  return apiJson<SkillMarketSkillResponse>('/api/skill-market/update', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function removeMarketplaceSkill(body: RemoveMarketplaceSkillRequest) {
  return apiJson<void>('/api/skill-market/remove', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
```

В `shared/api/index.ts` добавить `export { ... } from './skill-market';` блоком по образцу соседних (тип-реэкспорты контрактов не дублировать — они уже идут из shared).

- [ ] **Step 2: Проверка**

Run: `bunx tsc --noEmit -p apps/studio/client/tsconfig.json` → чисто; `bun run lint`.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/client/src/shared/api/skill-market.ts apps/studio/client/src/shared/api/index.ts
git commit -m "feat: add skill market client API wrappers"
```

---

### Task 9: UI: табы SkillsPane + feature install

**Files:**
- Create: `apps/studio/client/src/features/manage-skill-marketplace/index.ts`
- Create: `apps/studio/client/src/features/manage-skill-marketplace/model/install-skill-dialog.ts`
- Create: `apps/studio/client/src/features/manage-skill-marketplace/ui/install-skill-dialog.tsx`
- Create: `apps/studio/client/src/features/manage-skill-marketplace/README.md`
- Create: `apps/studio/client/src/pages/settings/ui/skills-marketplace-tab.tsx`
- Create: `apps/studio/client/src/pages/settings/ui/skills-installed-tab.tsx`
- Modify: `apps/studio/client/src/pages/settings/ui/skills-pane.tsx`
- Modify: `apps/studio/client/src/app` — только если `CreateSkillDialog` зарегистрирован в роутации overlay-диалогов по месту использования: найти, где рендерится `<CreateSkillDialog />` (`grep -rn CreateSkillDialog apps/studio/client/src/app`), рядом зарегистрировать `InstallMarketplaceSkillDialog`.

**Interfaces:**
- Consumes: API Task 8, `dialog.open` (`@/shared/services/overlay`), `Tabs*` (`@/shared/ui/tabs`), `ToggleGroup/ToggleGroupItem` (`@/shared/ui/toggle-group`), контракты Task 1.

- [ ] **Step 1: Feature `manage-skill-marketplace`**

`model/install-skill-dialog.ts` (форма как `manage-workspace-skills/model/skill-dialogs.ts`):

```ts
import type { MarketplaceSkillResult } from '@harnesys/studio-shared';

import { dialog } from '@/shared/services/overlay';

import { InstallMarketplaceSkillDialog } from '../ui/install-skill-dialog';

export function openInstallMarketplaceSkillDialog(entry: MarketplaceSkillResult) {
  return dialog.open(InstallMarketplaceSkillDialog, {
    title: `Install ${entry.name}`,
    description: `from ${entry.source}`,
    className: 'sm:max-w-md',
    testId: 'install-marketplace-skill-dialog',
    entry,
  });
}
```

`ui/install-skill-dialog.tsx`: `DialogComponentProps<SkillMarketSkillResponse>`; локальный state `scope` (`useState<'workspace'|'host'>('workspace')`, workspace value отключать при отсутствии `workspaceId` — пропсом в dialog.open передавать `workspaceId: string | null`). Перед кодом диалога открыть `shared/services/overlay` и подтвердить, что поля второго аргумента `dialog.open` доезжают до компонента как props (у `CreateSkillDialog` это `title/description/className/testId`); если прокидка иная — прокинуть `entry`/`workspaceId` существующим механизмом, не изобретая новый. `useMutation({ mutationFn: () => installMarketplaceSkill({ id: entry.id, scope, ...(workspaceId ? { workspaceId } : {}) }) })`, success → `onResolve?.(data)`, error → красный текст `<p role="alert">{message}</p>` в футере. Кнопки: Cancel / Install (pending → disabled, текст «Installing…»).

`index.ts`: `export { openInstallMarketplaceSkillDialog } from './model/install-skill-dialog'; export { InstallMarketplaceSkillDialog } from './ui/install-skill-dialog';`

`README.md` 5-12 строк: назначение, публичный API, вызываемый эндпоинт.

- [ ] **Step 2: `skills-installed-tab.tsx`**

Вынести текущий JSX-лист `SkillsPane` (каталог + Reload + New skill) в компонент без изменений, добавив:

1. `useQuery(skillMarketInstalledQuery('workspace', workspaceId))` для host-скоупа `('host')` — две выборки.
2. Map `byName = new Map<string, MarketplaceInstalledSkill>()` из обоих lock-списков по `name` и `slug`.
3. В `data-testid={skill-row}` каждой строке после name: `<Badge variant="outline" className="font-mono">{market.source}</Badge>` при совпадении, кнопка Remove (`removeMarketplaceSkill`, invalidate installed + skills-квериги + reload-skills mutation `reloadWorkspaceSkills` уже вызывается сервером для workspace scope; host — вызвать после мутации вручную), кнопка Update при наличии slug в локальном состоянии `updates`.
4. Кнопка панели «Check updates» рядом с Reload: `useMutation(() => checkMarketplaceUpdates({scope:'workspace', workspaceId}))`, результат в `useState<MarketplaceSkillUpdate[]>`, при непустом — toast «Updates available (n)».

- [ ] **Step 3: `skills-marketplace-tab.tsx`**

По форме `plugins-discover-tab.tsx` (тот же Input+Enter-debounce паттерн, `useState` q/debouncedQ): `useQuery(skillMarketSearchQuery({ q: debouncedQ }))`; строка результата: name (font-mono), installs (`formatInstalls`: `>=1000 → "12.3K"`), badge source; справа Install (variant ghost) → `openInstallMarketplaceSkillDialog(result).then(res => res && invalidate installed queries)`. Already installed (slug/name ∈ lock-список) → бейдж `installed`, кнопка disabled. Пустое состояние и pending — как в plugins-discover; ошибка `api.isError` → inline `<p className="text-muted-foreground text-sm">Marketplace temporarily unavailable. <Button variant="link" onClick={refetch}>Retry</Button></p>`.

- [ ] **Step 4: `skills-pane.tsx` → Tabs**

Заменить обёртку на структуру `plugins-pane.tsx`: `Tabs defaultValue="installed"`, триггеры `Installed`/`Marketplace` (`flex-1`), контент — `<SkillsInstalledTab />` / `<SkillsMarketplaceTab />`. Дочерние компоненты берут `workspaceId` сами через `useStudioLocation()`.

- [ ] **Step 5: Ручная проверка в браузере (agent-browser, скилл core, порт 5173)**

```bash
agent-browser open "http://localhost:5173/w/$WS/settings/skills"
agent-browser snapshot -i   # табы Installed / Marketplace
# Marketplace: fill search "react", Enter, дождаться строку vercel-react-best-practices, Install, выбрать scope Workspace, Install
agent-browser wait --text "Install"   # затем re-snapshot
```

Expected: строка появляется в Installed с badge `vercel-labs/agent-skills`, skill в списке каталога после reload; повторный install → бейдж `installed`.

- [ ] **Step 6: Linт + commit**

```bash
bun run lint
git add apps/studio/client/src/features/manage-skill-marketplace apps/studio/client/src/pages/settings/ui
git commit -m "feat: add skills marketplace UI to workspace settings"
```

---

### Task 10: Acceptance прогон spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-skillsh-marketplace-design.md` (Status → implemented, дописать отклонения, если найдены)

- [ ] **Step 1: Прогнать acceptance-секцию спека (6 сценариев)**

Сценарии 4-6 проверить curl-командами Task 7 Step 4 + правкой `skills-lock.json` (`contentHash` на `"0".repeat(64)` → `updates` покажет diff → `update` восстановит). Fallback: `HARNESYS_SKILLSSH_DOWNLOAD_URL=https://invalid.example bun --watch` перезапустить нельзя (чужой процесс) — проверить на отдельном инстансе: `HARNESYS_HOME=~/.harnesys HARNESYS_SKILLSSH_DOWNLOAD_URL=https://invalid.example bun run apps/studio/dev.ts --port 3100` только с явного согласия человека; иначе — bun-eval `fetchSkillFromGithub` (Task 3 Step 2) как доказательство fallback-ветки, репетицию WAF опустить и пометить в спеке «проверено прямым вызовом».

- [ ] **Step 2: Отметить Status и отклонения в спеке, commit**

```bash
git add docs/superpowers/specs/2026-09-11-skillsh-marketplace-design.md
git commit -m "docs: mark skill market spec implemented"
```

## Self-review notes

- Покрытие спека: Goal→T9, Verified behavior→T2, Decisions→T1-T9 (scope/lock/hash/fallback), Storage→T4, HTTP API→T7, Install pipeline+sanitize→T5/T2, UI→T9, Out of scope соблюдён (trending/curated/audit не реализованы нигде).
- Расхождение с веком, внесённое при детализации: `name` в lock = slug из API (без frontmatter-парсера), UI показывает slug+source; аудит-бейджа нет (spec решает это так же).
- Типы согласованы: `MarketplaceInstalledSkill` = entry lock; `toSkillSlug`/`computeSnapshotHash`/`parseMarketplaceId` названы одинаково в T2/T3/T5/T6.
