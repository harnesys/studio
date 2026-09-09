---
name: code-review
description: Review code changes, designs, PRs for blockers, risks, nits with exact file references
when_to_use: When reviewing diffs, architecture decisions, or agent outputs
---
# Code Review Skill

## Core Principle
Every review must separate verified observations (facts from files) from judgments (risks/blockers/nits). Point to exact `file:line` references for every claim.

## When Not to Use
Don't use this to approve work without reading the relevant files. Don't skip when time-pressured — rushing guarantees missed blockers.

## The Three Levels (In Order)

### Level 1: Blockers (Must Fix Before Proceeding)
These prevent the change from being safe or functional:
- TypeScript errors or `typecheck` failures
- Biome lint errors (`lint` failures)
- Breaking changes without migration path
- Security issues: secrets exposed, permission bypasses, injection vulnerabilities
- Data loss risks or destructive operations without safeguards
- Cyclic graphs without `budget.maxSteps` or `budget.deadlineMs`

### Level 2: Risks (Should Fix)
These don't break immediately but create future problems:
- Indexed access types (`T['field']`, `Parameters<typeof fn>[0]`) without named aliases
- Missing named types for reused shapes
- FSD layer violations (wrong imports, missing `index.ts` exports)
- Library API changed for single host need (violates library-first contract)
- Speculative code (new layers without second use case — YAGNI violation)
- Files exceeding ~300 lines doing multiple responsibilities
- Untested error paths in new functions
- Unrelated refactoring bundled with feature work

### Level 3: Nits (Polish)
These don't affect function but affect maintainability:
- Unnecessary or redundant comments
- Naming inconsistent with surrounding codebase
- `console.log` or debug output left in production code
- Missing `README.md` for new features (5-12 lines minimum)
- `any` types without explicit justification

## Anti-Patterns (Review Failures)

| Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|
| "Looks fine to me" without file references | Unverifiable — always cite `file:line` |
| Mixing observations and judgments | Confuses reader — separate verified from verdict |
| Skipping when under pressure | Blockers found late cost more than early review |
| "I'll fix it after approval" | Blockers must be fixed before proceeding |
| No risk identification | Future bugs come from unacknowledged risks |

## Review Output Format (Mandatory)
Every review must produce:

```markdown
## Review: [Branch/PR/Feature]

### Verified Observations (From Files)
- `packages/harnesys/src/domain/agent-definition.ts:44` — `AgentGraph` requires exactly one `core:start`.
- `app/studio/client/src/features/manage-agent/ui/draft-capabilities.tsx:26` — Skills query uses `workspaceSkillsQuery`.

### Blockers
- [ ] <code>invalid_type</code> at `capabilities.files` — expected object, got boolean. Fix: change to `{}` or `null`.

### Risks
- [ ] `graph.nodes.read_file.args.path` uses `$output.readTarget` — expression may fail if previous node doesn't set output properly.

### Nits
- `instructions` length exceeds 200 lines — consider splitting into shorter steps.

### Verdict
PASS with conditions / FAIL — [one-line summary referencing the blocking issue]
```

## Process Flow
1. Read all changed files (diff, not just descriptions)
2. Identify exact lines changed
3. Check type safety (`typecheck`) and style (`lint`) — mention in review
4. Verify observations against file content
5. Separate observations from judgments
6. Propose smallest fix for each blocker/risk
7. Report with exact `file:line` citations
