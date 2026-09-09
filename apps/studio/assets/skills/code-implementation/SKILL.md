---
name: code-implementation
description: Implement concrete code changes with named types, no speculative refactors
when_to_use: When writing, editing, or refactoring code in any project
---
# Code Implementation Skill

## Core Principle
Implement changes that match existing conventions exactly. Use named types over indexed access. Verify after each significant edit. Report file paths, line references, and verification results.

## When Not to Use
This is NOT for designing new architectures or new subsystems — use `brainstorm` first. This is NOT for investigating bugs — use `systematic-debugging`. This is NOT for planning multi-step work — use `task-planning`.

## The Process

### Before Implementing
1. **Explore** the codebase using `code-exploration`: read entry points (`index.ts`, `main.ts`), package manifests, directory layout. Find similar implementations.
2. **Identify** the exact files, types, and functions to add or modify. Check `docs/` or `.opencode/references/` for source of truth.

### Implementation Rules
- **No indexed access types** (`T['field']`, `Parameters<typeof fn>[0]`, `(typeof CONST)[number]`). Create named types (`type ModelCost = number`) next to the source definition.
- **FSD layer rules** (import only downward): `app → pages → widgets → features → entities → shared`. Slices export only through `index.ts`.
- **File size target**: ~300 lines. Split by responsibility (not by technical layer). Large files doing too much signal split needs.
- **No speculative code**: Don't create new layers/hooks/providers without a second use case (YAGNI).
- **Library vs host**: `packages/harnesys` is the source of truth; `apps/studio` is the host that adapts to it. Don't change library APIs for single host needs.

### Verification (Mandatory Before Claiming Done)
Run these checks in order. Report exact command and output:
1. `bun run typecheck` — TypeScript compilation
2. `bun run lint` — Biome linting
3. Manual browser verification (for UI changes) — navigate, click, check console
4. Log/file inspection (for backend changes)

**Anti-pattern: inventing test files when tests are forbidden.** Use allowed checks only.

### After Implementation
Report with:
- Exact files changed (`file.ts:line-range`)
- What changed and why
- Verification results (PASS/FAIL per check)
- Any remaining risks or follow-up needed

## Red Flags — Stop and Fix Before Continuing

| Thought | Action |
|---------|--------|
| "Quick edit, no need to check style" | Check FSD imports and type conventions. |
| "I'll add a generic helper just in case" | Don't create without second use case. |
| "I'll refactor the whole file while I'm here" | Only change what's needed for the task. |
| "I'll use `any` to speed this up" | Create a named type instead. |
| "This won't break anything" | Verify with typecheck + lint. |

## Anti-Patterns
- Indexed access types (`T['field']`) without named alias
- Missing `README.md` for new features (5-12 lines: purpose, server/client role, API, verification)
- `console.log` left in production code
- Unrelated refactoring bundled with feature work
- Changing library APIs for a single host need
