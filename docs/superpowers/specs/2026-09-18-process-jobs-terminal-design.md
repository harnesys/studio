# Process jobs + IDE Terminal bridge

Date: 2026-09-18. Status: draft for review.

## Goal

Агент запускает долгие процессы без блокировки turn (паритет Claude/Codex/Grok: start → id → poll/kill). Тот же реестр обслуживает IDE Terminal: `open_in_terminal` поднимает PTY-job, видимый в сайдбаре и IDE-табе.

## 1. SoT

Источник правды: `ProcessJobRegistry` в `packages/harnesys`.

Один объект job:

| Поле | Смысл |
|---|---|
| `id` | UUID |
| `cwd` | workdir (thread/workspace path) |
| `mode` | `pipes` \| `pty` |
| `title` | для UI (`Terminal`, `npm run dev`, …) |
| `command` | исходная строка shell |
| `status` | `running` \| `exited` \| `killed` \| `timed_out` |
| `exitCode` | number \| null |
| `createdAt` | ISO |
| `scrollback` | ring buffer текста (лимит 256 KiB) |

Studio metadata (`workspaceId`) хранит хост рядом с job id (map id→workspaceId) или передаёт в `create` как opaque tag, если порт это допускает. Реестр в библиотеке не знает про desk/URL.

Жизнь: in-memory, умирает с процессом сервера (как текущий Studio Terminal). Persist на диск не входит.

Лимиты (константы пака, override через pack spec позже при необходимости):

- max concurrent `running` на cwd: 16
- scrollback: 256_000 chars
- exited jobs остаются в list до `process_kill` / human delete (как exited terminal сейчас)

## 2. Runtime

### pipes

`Bun.spawn(['/bin/sh', '-c', command], { stdout/stderr: 'pipe', stdin: 'ignore', detached: true })`. stdout+stderr сливаются в один scrollback (с пометкой stderr префиксом или interleaved as-is; v1: concatenate as read, document as merged). Kill = process group SIGKILL (как сейчас `shell`).

### pty

`Bun.spawn(shellArgv, { terminal: { cols, rows, name, data } })` (как Studio `TerminalSessionRegistry`). Write/resize для WS IDE. Kill = kill proc + `terminal.close()`.

### Registry API (библиотека)

```ts
type ProcessJobMode = 'pipes' | 'pty';
type ProcessJobStatus = 'running' | 'exited' | 'killed' | 'timed_out';

type ProcessJobRecord = {
  id: string;
  cwd: string;
  mode: ProcessJobMode;
  title: string;
  command: string;
  status: ProcessJobStatus;
  exitCode: number | null;
  createdAt: string;
  workspaceId?: string;
};

type ProcessJobRegistry = {
  start(input: {
    cwd: string;
    command: string;
    mode: ProcessJobMode;
    title?: string;
    workspaceId?: string;
    env?: Record<string, string>;
    cols?: number;
    rows?: number;
  }): ProcessJobRecord;
  get(id: string): ProcessJobRecord | null;
  list(filter?: { cwd?: string; workspaceId?: string; mode?: ProcessJobMode }): ProcessJobRecord[];
  read(id: string, opts?: { since?: number }): { text: string; nextSince: number; truncated: boolean } | null;
  write(id: string, data: string): boolean;       // pty only
  resize(id: string, cols: number, rows: number): boolean; // pty only
  subscribe(id: string, onData: (chunk: string) => void, onExit?: (code: number | null) => void): (() => void) | null;
  kill(id: string): boolean;
  delete(id: string): boolean; // kill if running + drop from list
};
```

`read.since` — byte/char offset в накопленном scrollback для poll без полной пересылки.

## 3. Agent tools

Pack `shell` экспортирует три tools. Все `operations: ['process']`, `sideEffect: 'write'`.

### `shell` (расширение)

Вход:

- `command` (required)
- `timeout_ms` (optional, как сейчас; для blocking)
- `run_in_background` (optional bool)
- `block_until_ms` (optional int ≥ 0)
- `open_in_terminal` (optional bool → `mode: 'pty'`, иначе `pipes`)

Правила:

1. Default (нет background / block_until): поведение как сейчас — ждать exit в пределах `timeout_ms`, вернуть `{ exitCode, stdout, stderr, durationMs }`. Реестр не обязан создавать job (можно ephemeral).
2. `run_in_background: true` или `block_until_ms === 0`: сразу `start`, вернуть `{ jobId, mode, status: 'running', title }`.
3. `block_until_ms > 0`: `start`, ждать min(exit, block_until_ms). Если exit успел: полный результат как blocking + `jobId` (job уже exited в реестре). Если нет: `{ jobId, status: 'running', outputSoFar, timedOutWaiting: true }`.
4. `open_in_terminal: true` на blocking без background: допускается (PTY + ждать exit); UI может открыть таб на время run. Рекомендуемый путь агента для IDE: background + open_in_terminal.

Allowlist/blocklist gate без изменений.

### `process_poll`

Вход: `job_id`, optional `since`, optional `wait_ms` (short wait for new data, cap 30s).

Выход: `{ jobId, status, exitCode, output, since, nextSince, truncated }`.

### `process_kill`

Вход: `job_id`. Выход: `{ jobId, status }` после kill/delete policy: kill leaves record with `status: 'killed'` (delete = отдельный human/API путь). Tool kill = soft remove from agent view? Spec: **kill stops process, record stays** with `killed`; human sidebar "Kill terminal" calls host `delete` (kill + drop).

## 4. Studio wiring

### Inject registry

Один `ProcessJobRegistry` на node runtime (рядом с LSP/files). Передать в `shellCapability` ports при `registerPack` / `createRuntime`. Тот же instance — в HTTP Terminal controller.

### Migrate Terminal UI

Текущий `apps/studio/server/src/adapters/terminal/terminal-sessions.ts` заменяется адаптером над `ProcessJobRegistry` (`mode: 'pty'`).

REST:

- `POST /api/workspaces/:id/terminals` → `jobs.start({ mode: 'pty', command: login shell, cwd: workspace.path, workspaceId })`
- `GET .../terminals` → `jobs.list({ workspaceId, mode: 'pty' })`
- `DELETE .../terminals/:sessionId` → `jobs.delete(id)`
- WS `/api/terminals/:sessionId` → `subscribe` + `write`/`resize` (протокол JSON без смены)

Human create по-прежнему login shell без `command` строки агента; `command` в record = shell path / `"$SHELL -l"`.

### Agent → sidebar/tab

Когда `shell` создаёт `mode: 'pty'` job:

1. Host emits desk event (новый тип или reuse file-like invalidate) `terminal` / `process-job` с `{ workspaceId, jobId }`.
2. Client invalidates `terminalsQueryKey`, при желании `openTerminal(workspaceId, jobId)` (auto-open tab: **да** для agent-created pty jobs).

Pipe jobs в сайдбар Terminal **не** попадают.

### Journal UI

- `shell` background result: показать `jobId`, link/action «Open terminal» если `mode === 'pty'`.
- `process_poll` / `process_kill`: caption в `tool-input-summary` / tool-line.

## 5. Permissions and errors

- Gate `process` как у текущего `shell` (Studio modes ask/auto/dont_ask/bypass).
- Unknown `job_id`: tool result error string (не throw run), HTTP 404 для REST/WS.
- Max concurrent: `shell` background start возвращает ошибку в tool result.
- Sandbox/child runs: тот же registry node; `ToolContext.signal` abort на blocking shell как сейчас; background jobs **не** убиваются автоматически при конце parent turn (живут до kill/exit/server restart). Явный abort run не каскадирует в jobs в v1 (документировать; иначе легко снести `npm run dev`).

## 6. Out of scope

- Persist jobs across server restart
- Job attach from second Studio window / multi-host fan-out
- Separate stderr stream in poll API
- Renaming jobs / custom titles from agent beyond default
- Changing `background` plugin-agent frontmatter carrier (остаётся dropped)
- Unit/e2e test files (repo ban)

## 7. Check

Manual / curl:

1. Blocking `shell` unchanged (`echo ok` → exit 0).
2. `run_in_background: true` → jobId; `process_poll` видит output; `process_kill` → killed.
3. `open_in_terminal: true` + background → row in Terminal section + IDE tab + WS typing.
4. Human + in Terminal section still works on same registry.
5. `bun run lint` / `bun run typecheck` in affected packages.
