---
name: task-planning
description: Break any non-trivial task into ordered steps with clear owners and exit criteria
when_to_use: Before implementing any feature, fix, or design change
---
# Task Planning Skill

## Core Principle
Every non-trivial task needs a written plan with: owner, exit criteria, dependencies, and out-of-scope declaration. Implementation starts only after approval.

## When This Applies
- Any feature or behavior change
- Any bug fix that touches more than one file
- Any refactor that changes interfaces
- Any design change affecting other agents/components

## Anti-Patterns (Plan Failures)
These patterns mean the task needs a plan:
- "Implement feature X" with no steps (too vague)
- No owner assigned
- No exit criteria
- Hidden dependencies (step 3 depends on step 1, but not listed)
- More than 7 steps without sub-plan decomposition
- Speculative steps ("maybe add X" — decide, don't guess)

## Plan Template (Required Header)
Every plan MUST start with:

```markdown
## Plan: [Feature Name]

**Goal:** [One sentence — what this builds]
**Scope:** [What's included]
**Out of Scope:** [Explicit exclusions — prevents scope creep]
**Tech Stack / Context:** [Libraries, versions, file patterns relevant]
```

## Step Structure
Each step is a self-contained, independently reviewable unit:

```markdown
### Step N: [Action Name] — Owner: <agent-role>

**Depends on:** [step numbers or "—"]
**Exit Criteria:** [Concrete, verifiable outcome — not "done"]
**Files Touched:** [exact paths]
**Risk:** [What could go wrong — mention it]

- [ ] Sub-step: [exact action with command/file reference]
- [ ] Sub-step: [verification command if applicable]
```

Example exit criteria (good):
- "Typecheck passes (`bun run typecheck` zero errors)"
- "Lint passes (`bun run lint` zero warnings)"
- "Manual browser check of form submission passes — screenshot saved"
- "Plan saved to `<workspace>/.harnesys/plans/<date>-<task>.md`"

Bad exit criteria (vague):
- "Implemented"
- "Done"
- "Fixed"

## Decomposition Rule
If a task requires more than 7 steps, decompose into sub-plans first. Each sub-plan produces working, independently verifiable output.

## Verification Requirement
Every plan task must include verification steps. Use allowed checks only (`typecheck`, `lint`, `manual`, `shell`). Never invent test files.
