# Task 4 — Validate / compile / check (08) — Report

## Scope
Implement `packages/harnesys/src/application/validate.ts`, `compile.ts`, `check.ts` and modify `domain/errors.ts`, `domain/agent-definition.ts`, `index.ts` per `docs/superpowers/specs/2026-08-30-harnesys-0.2.0-design.md` §Validate and `.superpowers/sdd/2026-08-30-harnesys-0.2.0/task-4-brief.md`. Provide `Diagnostic {code,severity,path?,message}`, `DiagnosticSeverity`, `ValidationError {diagnostics}`, `validateStructural` with codes `id_required,version_format,start_count,end_count,edge_endpoint,outgoing_required,missing_default,default_edge,prompt_missing,tool_call_shape,barrier_policy,goto_target,expr_syntax,cycle_budget,messages_path,concurrent_replace` + warnings `spawn_targets_dynamic,output_key_reserved,unreachable`, `compile` pure plan `nodes+edgesByFrom+order`, `check` probing `tools_unresolved,model_unresolved,unsupported_node,duplicate_hitl`, `defineAgent` throwing `ValidationError` on error diagnostics with JSON round-trip preserve. Imports `.ts`, file ≤300 (application override), biome pass.

## Files Created/Modified
- Modified: `packages/harnesys/src/domain/errors.ts` — added `DiagnosticSeverity`, `Diagnostic`, `ValidationError` (24 lines). Keeps `NotImplementedError`.
- Modified: `packages/harnesys/src/domain/agent-definition.ts` — added `AgentNodes`, `AgentEdges`, `AgentGraph` named types to avoid `T['field']`, imported `validateStructural` + `ValidationError`, `defineAgent` now validates and throws on error diagnostics, otherwise `JSON.parse(JSON.stringify(def))` (115 lines after biome fix).
- Created: `packages/harnesys/src/application/validate.ts` — `validateStructural` with `SEMVER_RE`, `RESERVED` keys, `hasCycle` DFS, inner `add`/`tryParse` closures capturing `diags`, checks all structural codes using `parseExpr`/`isPathExpr`, cycle budget via `budget.maxSteps|deadlineMs`, concurrent_replace for parallel spawn with `reducers:replace`, spawn_targets_dynamic warning via `JSON.parse`, unreachable via BFS from `core:start`, output_key_reserved via schema properties intersect, messages_path via path check, prompt instructions `/\{\$[^}]+\}/g` via `matchAll` (290 lines after format).
- Created: `packages/harnesys/src/application/compile.ts` — pure `compile(def)` builds `edgesByFrom` Map, `order=Object.keys(nodes)`, returns `{plan, diagnostics}` (31 lines).
- Created: `packages/harnesys/src/application/check.ts` — `check(def, opts)` merges `compile` diagnostics with `tools_unresolved` (llm.tools + fixed tool name vs `opts.tools`), `model_unresolved` via `bindingOf` loop over `ProviderConfig[]`, `unsupported_node` for `custom:*` or unknown type vs `opts.nodes`, `duplicate_hitl` stub skipped for 0.2 (108 lines).
- Modified: `packages/harnesys/index.ts` — exports `ValidationError`, `Diagnostic`, `DiagnosticSeverity` (via errors), `compile`, `Plan`, `check`, `CheckOptions`, `validateStructural`.

## Verification
- `bunx tsc --noEmit --project packages/harnesys/tsconfig.json` — PASS (no output)
- `bunx @biomejs/biome check packages/harnesys/src/domain/errors.ts packages/harnesys/src/domain/agent-definition.ts packages/harnesys/src/application/validate.ts packages/harnesys/src/application/compile.ts packages/harnesys/src/application/check.ts packages/harnesys/index.ts` — `Checked 5 files in ~170ms. No fixes applied.` after `check --write` on validate/compile/check/agent-definition.
- `bun -e` defineAgent throw on bad id — `ValidationError id_required,end_count,outgoing_required` — PASS
- `bun -e` compile good — 0 diagnostics, defineAgent JSON round-trip `true` and `out!==def` — PASS
- `bun -e` cycle_budget — `cycle_budget` found — PASS
- `bun -e` tools_unresolved — `tools_unresolved` found — PASS
- `bun -e` model_unresolved with missing provider — `model_unresolved` found, with correct provider — 0 — PASS
- `bun -e` unsupported_node custom without registry — `unsupported_node` found, with registry — 0 — PASS
- Extended ad-hoc for codes `id_required,version_format,start_count,edge_endpoint,prompt_missing,tool_call_shape,barrier_policy,goto_target,expr_syntax,messages_path,unreachable` — all `OK` — PASS
- `wc -l` validate 290, compile 31, check 108, errors 24, agent-definition 115, index 57 — all ≤300 except validate hits 290 within application override limit.

## Decisions
- Added `AgentNodes`/`AgentEdges`/`AgentGraph` in `agent-definition.ts` to satisfy `no-indexed-access-type` plugin; `DiagnosticSeverity` added similarly for `Diagnostic['severity']`.
- `validateStructural` uses closure `add` with 4 params `(code,severity,message,path)` to satisfy `useMaxParams:4`; `tryParse` also closure.
- `hasCycle` DFS with `visiting`/`visited` sets; cycle detection iterates all nodes to cover disconnected components.
- `expr_syntax` via `parseExpr` on `when`, `messages`, `target`, `patch` values starting with `$` or containing `{$}`, `calls`/`concurrency` when `$`, `args` values, and prompt instructions `matchAll`.
- `messages_path` requires `isPathExpr` and `startsWith('$state.')`; `messages_path` error only if parse succeeded.
- `concurrent_replace` simplified to parallel spawn branches writing same key with `reducers==='replace'`; tool batch parallel concurrency not considered spawn for 0.2.
- `spawn_targets_dynamic` warning when `control:spawn` parallel and `calls` not `JSON.parse` array literal.
- `unreachable` warning via BFS from single `core:start`; skipped if start count !=1.
- `check` ignores missing `opts.tools` to avoid noisy errors when no registry provided; `model_unresolved` resolves string via `bindingOf` loop and `AgentModelRef` via provider lookup.
- Kept `duplicate_hitl` as comment stub per brief `skip for 0.2`.

## Self-review
- No `T['field']` or `Parameters<typeof fn>[0]`; all field types via named exports.
- No `*.test.ts`, `index.ts` barrel used, imports `.ts`.
- All codes from brief present: structural 16 + 3 warnings + 4 check codes.
- `defineAgent` preserves JSON round-trip on success, throws `ValidationError` with filtered error diagnostics.

## Concerns
- `validate.ts` 290 lines approaches 300 limit; any additional checks may exceed without refactor into submodules, but `application/**` override `noExcessiveLinesPerFile: off` allows it. If strict 300 enforced without override, future split into `validate-*` subfiles required.
- `concurrent_replace` static detection is heuristic (counts `control:assign` patches globally, not per branch reachability). Full branch-aware analysis needs spawn graph traversal; deferred to 0.3 `spawn` implementation.
- `barrier_policy` check uses `policy !== 'all'` direct string compare; if `barrier` is `undefined` (omitted) spec says allowed, we correctly allow omitted; if `barrier: {}` present but policy missing, we currently flag as error (since `undefined !== 'all'`); spec says policy must be `'all'` if barrier present, so flag is correct.
- `model_unresolved` for omitted `llm.model` checks `def.model` fallback; if `def.model` also omitted, no error flagged, matching 06 binding where model can be unresolved until runtime config. If spec expects error when no default at all, this would need adjustment.

## Commit
- `feat(harnesys): validate/compile/check codes and defineAgent throw (08)`
- Files: `packages/harnesys/src/domain/errors.ts`, `packages/harnesys/src/domain/agent-definition.ts`, `packages/harnesys/src/application/validate.ts`, `packages/harnesys/src/application/compile.ts`, `packages/harnesys/src/application/check.ts`, `packages/harnesys/index.ts`, `.superpowers/sdd/2026-08-30-harnesys-0.2.0/task-4-report.md`
