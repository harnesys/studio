---
name: verification-testing
description: Verify changes using only project-allowed checks (no new test files)
when_to_use: After implementing any change
---
# Verification & Testing Skill

Tests (`*.test.ts`, `*.spec.ts`, `playwright`) are forbidden. Verify only with allowed checks.

## Allowed Checks (In Order)
1. Static: `bun run typecheck` — TypeScript compilation must pass
2. Static: `bun run lint` — Biome lint must pass
3. Manual browser: agent-browser for UI changes — navigate, click, check console errors, take screenshots if needed
4. Shell/manual: run relevant commands, inspect logs/files for backend changes
5. Regression: run related existing flows manually

## Verification Process

**Before claiming any work complete:**

1. **Identify what changed** — exact files, types, behaviors
2. **Run static checks** — report PASS/FAIL with command output
3. **Manual browser test** (if UI changed):
   - Navigate to affected page
   - Execute user workflow
   - Check browser console for errors
   - Note any UI inconsistencies
4. **API/manual verification** (if backend changed):
   - Call endpoints with test input
   - Verify response shape/status codes
   - Check database/state if applicable
5. **Regression check** — related flows still work

## Report Format

Every verification must include:

```markdown
## Verification: <feature/change>

### Static Checks
- [x] `bun run typecheck` — PASS (or FAIL with output)
- [x] `bun run lint` — PASS (or FAIL with errors)

### Manual Tests
| Scenario | Steps | Expected | Actual | Status |
|---|---|---|---|---|
| ... | ... | ... | ... | PASS/FAIL |

### Issues Found
- <issue description> — `file:line` — reproduction

### Verdict
PASS / FAIL — <one-line summary with paths>
```

## Red Flags — Wrong Approaches

| Wrong Approach | Correct Approach |
|---|---|
| "I'll create a quick test file" | Tests forbidden. Use typecheck + lint + manual checks. |
| "Manual check isn't needed, it looks fine" | Always verify — appearance is not evidence. |
| "I'll verify later" | Verify before claiming complete. Later never happens. |
| "Only the new code needs checking" | Check related flows for regression. |
