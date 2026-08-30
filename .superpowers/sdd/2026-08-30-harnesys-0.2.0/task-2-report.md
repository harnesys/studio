# Task 2 — Tool factory and registry (07) — Report

## Scope
Implement Harnesys 0.2.0 Tools (07) per `docs/superpowers/specs/2026-08-30-harnesys-0.2.0-design.md` §Tools and `.superpowers/sdd/2026-08-30-harnesys-0.2.0/task-2-brief.md`. Provide `SideEffect`, `ToolContext`, `ToolDefinition`, `ToolExecute`, `tool(name,spec)` factory with name/description validation, `createToolRegistry` with collision throw, `validateToolInput` via Ajv (`ajv@8` already in deps). Keep `packages/harnesys/package.json` version 0.1.0, no `ai` public exports, files ≤300 lines, `T['field']` banned via `plugins/no-indexed-access-type.grit`, `.ts` extensions, `import type` separation.

## Files Created/Modified
- Modified: `packages/harnesys/src/ports/tools.ts` — extended existing 32-line skeleton (`SideEffect`/`ToolContext`/`ToolDefinition`/`CustomNodeImpl`) to 62 lines. Added `ToolExecute` named type `(input: unknown, ctx: ToolContext) => Promise<unknown> | unknown` to avoid indexed access (`ToolDefinition['execute']` banned by biome plugin). `ToolDefinition.execute` now typed as `ToolExecute`. Added `tool(name,spec)` factory validating `name` non-empty string and `spec.description` presence, returning `{ name, description, group, operations, input, execute, sideEffect }`. Retains `CustomNodeImpl` for downstream compatibility.
- Created: `packages/harnesys/src/application/tool-registry.ts` — 26 lines. Module-level `const ajv = new Ajv({ strict: false, allErrors: true })`. `createToolRegistry(tools: ToolDefinition[] = []) => Map<string,ToolDefinition>` iterates and throws `tool collision: ${t.name}` on duplicate. `validateToolInput(schema, data) => { ok, errors? }` calls `ajv.validate(schema as never, data)` and returns `ajv.errorsText` on failure.
- Modified: `packages/harnesys/index.ts` — added `export { tool } from './src/ports/tools.ts'`, `export { createToolRegistry, validateToolInput } from './src/application/tool-registry.ts'`. Preserved `export type { CustomNodeImpl, SideEffect, ToolContext, ToolDefinition }`. File 51 lines.

## Verification
- `bunx tsc --noEmit --project packages/harnesys/tsconfig.json`
  ```
  (no output)
  exit 0 — PASS
  ```
  Required `bun install` in worktree (`packages/harnesys` had no `node_modules`); after install ajv types resolve via `moduleResolution: bundler`.

- `bunx @biomejs/biome check --write ./packages/harnesys/src/ports/tools.ts ./packages/harnesys/src/application/tool-registry.ts`
  ```
  Checked 2 files in 186ms. No fixes applied.
  ```
  Initial run failed with `plugins/no-indexed-access-type.grit` on `ToolDefinition['execute']` at `src/ports/tools.ts:41`. Fixed by introducing named `ToolExecute` type and using it in both `ToolDefinition` and `tool()` spec (no indexed access remains).

- File size check: `wc -l` — `ports/tools.ts` 62, `application/tool-registry.ts` 26, `index.ts` 51; all <300.

## Decisions
- Introduced `ToolExecute` named type instead of `ToolDefinition['execute']` to satisfy `plugins/no-indexed-access-type.grit`. Behaviour identical; avoids lint violation while keeping spec signature. `ToolExecute` exported from `ports/tools.ts` but not re-exported from `index.ts` (brief does not request it; can add in Task 4 if needed).
- Kept `CustomNodeImpl` in `ports/tools.ts` (existing 32-line file already had it). Brief snippet omits it but task description says "extend" not replace.
- `tool()` validates `spec.description` truthiness only (brief: `if(!spec.description)`), not `spec.input`/`spec.execute` presence. Matches Harnesys 07 structural validation; runtime Ajv validates `input` later.
- `createToolRegistry` default parameter `[]` matches brief; collision message exactly `tool collision: ${t.name}` per spec (lowercase, single space).
- Ajv instance module-scoped with `strict: false, allErrors: true` per brief; `validateToolInput` uses `ajv.validate(schema as never, data)` and `ajv.errorsText(ajv.errors)` for error string.

## Self-review
- No `T['field']` indexed access; `ToolExecute` used instead.
- All imports use `.ts` extensions and `import type` where applicable (`JsonSchema`, `ArtifactStore`, `ToolDefinition`).
- No `ai`/`@ai-sdk` imports in ports/application; only `ajv`.
- Single quotes, trailing commas, `useImportType`/`organizeImports` satisfied via biome `--write`.
- `packages/harnesys/package.json` version still `0.1.0`; `exports` unchanged.

## Concerns
- `ToolExecute` is new public type not listed in brief exports. If downstream expects `ToolDefinition['execute']` indexed access, they must import `ToolExecute` instead. Consider re-exporting `ToolExecute` from `index.ts` in Task 4.
- `validateToolInput` reuses single `Ajv` instance; Ajv caches schemas but with `strict: false` may cache invalid schemas. No isolation per call; acceptable for 0.2 but may need `Ajv({ strict:false, allErrors:true, validateSchema: false })` if schema validation errors surface.
- `tool()` does not validate `input` is a `JsonSchema` object; invalid schemas will fail at `validateToolInput` time only. Could add structural check in Task 4 `check` diagnostics.

## Commit
- `feat(harnesys): tool() factory and registry with Ajv (07)`
- Files: `packages/harnesys/src/ports/tools.ts`, `packages/harnesys/src/application/tool-registry.ts`, `packages/harnesys/index.ts`
