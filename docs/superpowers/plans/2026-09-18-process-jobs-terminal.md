# Process jobs + IDE Terminal bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Background/process poll-kill for agent `shell`, shared `ProcessJobRegistry` with IDE Terminal PTY sessions.

**Architecture:** Library owns `ProcessJobRegistry` (pipes + pty). Pack `shell` gains background fields and `process_poll` / `process_kill`. Studio injects one registry per node into the pack and migrates Terminal REST/WS onto it; agent pty jobs auto-open IDE tabs via desk invalidate.

**Tech Stack:** Bun.Terminal / Bun.spawn, Hono WS, React FSD, existing `@xterm/xterm` tab.

**Spec:** `docs/superpowers/specs/2026-09-18-process-jobs-terminal-design.md`

## Global Constraints

- File ops only inside `~/Projects/Harnesys` and `~/.harnesys`.
- No `*.test.ts` / `*.spec.ts` (repo ban). Verify with `bun run lint`, `bun run typecheck`, curl against API, manual Studio UI.
- Public `packages/harnesys` changes are in-scope for this plan (approved by design).
- Studio files ~300 lines; split by responsibility.
- One task at a time, no drive-by refactors.
- Do not start/kill the user's Studio/Vite processes; use the already running stand when checking.

## File map

| Path | Role |
|---|---|
| `packages/harnesys/src/domain/process-job.ts` | Record/status/mode types |
| `packages/harnesys/src/application/process-jobs/process-job-registry.ts` | Registry impl |
| `packages/harnesys/src/packs/shell/shell.ts` | Extended `shell` + helpers |
| `packages/harnesys/src/packs/shell/process-tools.ts` | `process_poll`, `process_kill` |
| `packages/harnesys/src/packs/base.ts` | `shellCapability` ports + tool meta |
| `packages/harnesys/index.ts` | Re-exports |
| `apps/studio/server/.../wire-packs.ts` | Inject registry |
| `apps/studio/server/.../terminal/` | Adapt REST/WS to registry; delete old sessions file or thin-wrap |
| `apps/studio/server/.../desk-events` | Optional job event for client invalidate |
| `apps/studio/client/.../tool-input-summary.ts` | Captions for new tools |
| `apps/studio/client/.../terminal-section.tsx` / desk sync | Auto-open pty tab |

---

### Task 1: ProcessJob types + registry in harnesys

**Files:**
- Create: `packages/harnesys/src/domain/process-job.ts`
- Create: `packages/harnesys/src/application/process-jobs/process-job-registry.ts`
- Modify: `packages/harnesys/index.ts` (export types + `ProcessJobRegistry` / `createProcessJobRegistry`)

**Interfaces:**
- Consumes: Bun.spawn, Bun.Terminal
- Produces: `createProcessJobRegistry(): ProcessJobRegistry` matching the spec API (`start`, `get`, `list`, `read`, `write`, `resize`, `subscribe`, `kill`, `delete`)

- [ ] **Step 1: types**

```ts
// domain/process-job.ts
export type ProcessJobMode = 'pipes' | 'pty';
export type ProcessJobStatus = 'running' | 'exited' | 'killed' | 'timed_out';

export type ProcessJobRecord = {
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

export type ProcessJobReadResult = {
  text: string;
  nextSince: number;
  truncated: boolean;
};

export type ProcessJobRegistry = {
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
  list(filter?: {
    cwd?: string;
    workspaceId?: string;
    mode?: ProcessJobMode;
  }): ProcessJobRecord[];
  read(id: string, opts?: { since?: number }): ProcessJobReadResult | null;
  write(id: string, data: string): boolean;
  resize(id: string, cols: number, rows: number): boolean;
  subscribe(
    id: string,
    onData: (chunk: string) => void,
    onExit?: (code: number | null) => void,
  ): (() => void) | null;
  kill(id: string): boolean;
  delete(id: string): boolean;
};
```

- [ ] **Step 2: registry implementation**

Implement `createProcessJobRegistry` in `process-job-registry.ts`:

- `mode: 'pipes'`: `/bin/sh -c command`, merge stdout/stderr chunks into scrollback (TextDecoder), `detached: true`, kill via process group as in current `shell.ts`.
- `mode: 'pty'`: login shell argv when `command` is empty sentinel or pass `command` through `sh -c` inside pty if non-empty; prefer mirroring current Studio terminal spawn (`SHELL -l`) for human terminals where `command` is the shell display string.
- Scrollback ring 256_000 chars; `read(since)` slices `scrollback.slice(since)`.
- Cap concurrent `running` at 16 per `cwd`; `start` throws `Error('too many running process jobs')` when exceeded.
- `onExit` updates status/exitCode and notifies exit listeners.

- [ ] **Step 3: export**

Export from `packages/harnesys/index.ts` next to other pack/domain exports.

- [ ] **Step 4: verify**

Run from repo root:

```bash
cd packages/harnesys && bun run typecheck && bun run lint
```

Expected: PASS.

Smoke (local script, no test file):

```bash
cd packages/harnesys && bun -e '
import { createProcessJobRegistry } from "./index.ts";
const jobs = createProcessJobRegistry();
const j = jobs.start({ cwd: process.cwd(), command: "printf HI\\\\n", mode: "pipes" });
await Bun.sleep(200);
console.log(jobs.read(j.id), jobs.get(j.id)?.status);
'
```

Expected: output contains `HI`, status `exited`.

---

### Task 2: Extend shell + process_poll + process_kill

**Files:**
- Modify: `packages/harnesys/src/packs/shell/shell.ts`
- Create: `packages/harnesys/src/packs/shell/process-tools.ts`
- Modify: `packages/harnesys/src/packs/base.ts`
- Modify: `packages/harnesys/src/adapters/actions/index.ts` if it re-exports shell only

**Interfaces:**
- Consumes: `ProcessJobRegistry` via pack ports
- Produces: tools `shell`, `process_poll`, `process_kill` from `shellCapability.create`

- [ ] **Step 1: pack ports**

In `base.ts`, change `shellCapability` to ports `{ jobs: ProcessJobRegistry }`:

```ts
export type ShellPackPorts = { jobs: ProcessJobRegistry };

export const shellCapability = definePack<ShellPackPorts, ShellPackSpec>({
  // ...
  meta: {
    tools: [
      { name: 'shell', description: 'Run a shell command; optional background / terminal.' },
      { name: 'process_poll', description: 'Read output and status of a process job.' },
      { name: 'process_kill', description: 'Kill a process job started by shell.' },
    ],
    skills: [],
    hasSettings: true,
  },
  create: (ctx) => ({
    tools: [
      shell(shellOptionsFromSpec(ctx.spec), ctx.ports.jobs),
      ...processTools(ctx.ports.jobs),
    ],
  }),
});
```

- [ ] **Step 2: shell execute branches**

Extend input schema with `run_in_background`, `block_until_ms`, `open_in_terminal`.

```ts
execute(input, ctx) {
  const parsed = input as {
    command: string;
    timeout_ms?: number;
    run_in_background?: boolean;
    block_until_ms?: number;
    open_in_terminal?: boolean;
  };
  const mode = parsed.open_in_terminal ? 'pty' : 'pipes';
  const background =
    parsed.run_in_background === true ||
    parsed.block_until_ms === 0;

  if (!background && parsed.block_until_ms === undefined) {
    return runBlocking(parsed.command, timeoutMs, ctx, jobs, mode);
  }
  // start job; if block_until_ms > 0 wait; else return jobId
}
```

Keep allowlist/blocklist `gate` unchanged. Blocking default path may call existing `runOnHost` for pipes; for pty+blocking use registry start + wait on exit.

- [ ] **Step 3: process tools**

```ts
// process-tools.ts
export function processTools(jobs: ProcessJobRegistry): ToolDefinition[] {
  return [
    tool('process_poll', {
      operations: ['process'],
      sideEffect: 'write',
      // input: job_id, since?, wait_ms?
      execute: async (input) => { /* jobs.read + optional wait via subscribe */ },
    }),
    tool('process_kill', {
      operations: ['process'],
      sideEffect: 'write',
      execute: (input) => {
        const id = (input as { job_id: string }).job_id;
        const ok = jobs.kill(id);
        return { jobId: id, status: jobs.get(id)?.status ?? 'missing', ok };
      },
    }),
  ];
}
```

- [ ] **Step 4: verify**

```bash
cd packages/harnesys && bun run typecheck && bun run lint
```

Expected: PASS. Fix all call sites that register `shellCapability` without ports (next task if only Studio).

---

### Task 3: Studio inject registry + migrate Terminal adapter

**Files:**
- Modify: `apps/studio/server/src/composition/wire-packs.ts`
- Modify: `apps/studio/server/src/adapters/workspace-harnesys.registry.ts` (or create-host) where packs resolve
- Create or rewrite: `apps/studio/server/src/adapters/terminal/terminal-sessions.ts` as thin facade over shared registry
- Modify: `apps/studio/server/src/adapters/http/terminal/terminal.controller.ts` if signatures change
- Modify: node composition so each node has `jobs: ProcessJobRegistry`

**Interfaces:**
- Consumes: `createProcessJobRegistry` from `harnesys`
- Produces: same HTTP/WS contract as today for Terminal; shell pack receives `ports.jobs`

- [ ] **Step 1: per-node registry**

Where node host/runtime is composed, `const jobs = createProcessJobRegistry()`. Store on host object next to `lsp`. Pass into pack registration:

```ts
registerPack(shellCapability, {
  resolveScope: stubScope,
  resolvePorts: () => ({ jobs: node.host.jobs }),
});
```

Match existing `definePack` ports resolution pattern used by other packs (copy from memory/lsp packs in `wire-packs.ts`).

- [ ] **Step 2: Terminal facade**

Replace internal PTY map with:

```ts
create(workspaceId, cwd) {
  return jobs.start({
    workspaceId,
    cwd,
    mode: 'pty',
    command: process.env.SHELL ?? '/bin/zsh',
    title: nextTitle(workspaceId),
  });
}
```

Map `subscribe`/`write`/`resize`/`delete`/`list` onto registry. Keep exported helpers used by `TerminalController` stable so controller diffs stay small.

- [ ] **Step 3: verify API**

With Studio already running (or after watch reload):

```bash
# bootstrap token + workspace id, then:
curl -s -H "Authorization: Bearer $TOKEN" -X POST \
  http://127.0.0.1:3000/api/workspaces/$WS/terminals
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:3000/api/workspaces/$WS/terminals
```

Expected: 201 create, list contains pty job.

```bash
cd apps/studio/server && bun run typecheck && bun run lint
```

Expected: PASS.

---

### Task 4: Desk event + client auto-open + tool captions

**Files:**
- Modify: desk event union in `@harnesys/studio-shared` / server desk adapter (add `{ type: 'terminal', workspaceId, jobId }` or `{ type: 'process-job', ... }`)
- Emit from shell execute path on Studio side **or** from Terminal facade when `mode === 'pty'` start — prefer emit in Studio wrapper when agent shell returns pty job (host hook). If no host hook exists, emit inside Terminal facade `start` only covers human create; then add a small Studio tool wrapper. Simplest path that matches spec: after migrating Terminal to registry, add Studio-side notification when listing sees new ids is insufficient — emit from a thin Studio `shell` wrapper only if pack cannot. **Preferred:** registry `start` accepts optional `onStarted` is overkill; emit in Studio `TerminalController` is wrong for agent. Implement emit in node runtime tool interceptor if one exists; otherwise extend pack ports with `onPtyJob(record)` callback from Studio.

Concrete preferred ports shape:

```ts
export type ShellPackPorts = {
  jobs: ProcessJobRegistry;
  onPtyJob?: (record: ProcessJobRecord) => void;
};
```

Call `onPtyJob` from `shell` when `mode === 'pty'` after `start`. Studio wires it to `deskEvents.publish({ type: 'terminal', ... })`.

- Modify: `apps/studio/client/src/shared/api/desk.ts` consumer to invalidate `terminalsQueryKey` and call `openTerminal`
- Modify: `apps/studio/client/src/features/send-message/model/tool-input-summary.ts` for `process_poll` / `process_kill` / background `shell` jobId preview

- [ ] **Step 1: shared event type + server publish**

- [ ] **Step 2: client watch handler**

On event: `queryClient.invalidateQueries({ queryKey: terminalsQueryKey(workspaceId) })`; `useIdeStore.getState().openTerminal(workspaceId, jobId)`; navigate `studioPath.terminal(...)` if focus policy allows (same as opening from sidebar).

- [ ] **Step 3: tool captions**

- [ ] **Step 4: verify**

```bash
cd apps/studio/client && bun run typecheck && bun run lint
cd apps/studio/shared && bun run typecheck
```

Expected: PASS.

Manual: agent (or curl simulating job create + desk event if easier) → Terminal row + tab. Background pipes job does not appear in Terminal section; `process_poll` works via agent tool call in UI.

---

### Task 5: Docs touch + acceptance pass

**Files:**
- Modify: `apps/studio/assets/skills/agent-creator/SKILL.md` shell row (mention background fields + process_*)
- Spec status line → `approved` only if human marks it; implementer leaves draft unless told

- [ ] **Step 1: agent-creator skill table**

Document:

| tool | notes |
|---|---|
| `shell` | `run_in_background`, `block_until_ms`, `open_in_terminal` |
| `process_poll` | `job_id`, `since`, `wait_ms` |
| `process_kill` | `job_id` |

- [ ] **Step 2: acceptance checklist (manual)**

1. Blocking `echo ok` unchanged.
2. Background `sleep 2; echo done` → poll sees done.
3. `open_in_terminal` background → sidebar + tab + type in xterm.
4. Human + Terminal still works.
5. Kill from sidebar removes pty job; kill via `process_kill` marks killed.
6. Root `bun run lint` / `bun run typecheck` PASS.

---

## Spec coverage

| Spec section | Task |
|---|---|
| §1 SoT registry | Task 1 |
| §2 pipes/pty runtime | Task 1 |
| §3 shell + process_* | Task 2 |
| §4 Studio inject + Terminal migrate | Task 3 |
| §4 Agent → sidebar/tab | Task 4 |
| §4 Journal captions | Task 4 |
| §5 permissions (reuse process) | Task 2 (operations unchanged) |
| §6 out of scope | (no tasks) |
| §7 check | Tasks 1–5 verify steps |

## Notes for executor

- Repo test ban: do not add vitest files; use bun one-liners and curl.
- Do not expand into job persistence or multi-host.
- If `definePack` ports resolution in Studio differs from the snippets, follow the existing memory/lsp pack pattern in `wire-packs.ts` rather than inventing a new registration API.
