---
name: research-methodology
description: Gather facts from workspace, docs, and sources with exact citations; separate verified from hypotheses
when_to_use: Before proposing any edit, fix, or design change that requires evidence
---
# Research Methodology Skill

## Core Principle
Every claim must include a citation (`file.ts:line`). Separate verified findings from hypotheses explicitly. Deliver a brief that a specialist agent can act on without re-reading your work.

## When to Use
- Before implementing changes in unfamiliar code
- Before proposing design changes
- Before creating agent configurations
- Before writing documentation
- Before fixing any non-obvious bug

## The Four Phases

### Phase 1: Define the Question (Before Searching)
State the exact question. If you don't know the exact question, you don't know what to search for.

Good questions:
- "How does `AgentGraph.compile()` handle cyclic graphs?"
- "Which files implement the `files` capability?"
- "What is the convention for FSD imports in this project?"

Bad questions:
- "How does this work?" (too broad)
- "Find everything about agents" (no scope)

### Phase 2: Source Identification
Identify sources in priority order:
1. **Primary**: Source code (`packages/harnesys/src/`), docs (`docs/`), config files (`biome.json`, `tsconfig.json`), recent git commits
2. **Secondary**: Running system output, logs, manual tests, tool results
3. **Tertiary**: External docs (only when primary doesn't cover the topic)

Always cite the exact file path and line for code references.

### Phase 3: Evidence Collection
Use targeted searches — don't read entire files randomly:

```bash
grep -r "compile" packages/harnesys/src/application/ --include="*.ts"
glob "**/*graph*"
read_file "packages/harnesys/src/domain/agent-definition.ts"
```

For expressions or APIs: find the definition first, then read usage nearby. Don't guess from memory.

### Phase 4: Synthesis
Structure findings by theme. Note contradictions between sources (e.g., docs say X, code does Y — that's a finding, not an error). Mark hypotheses clearly.

## Output Format (Required)
Every brief must use this format:

```markdown
## Research Brief: [Topic]

### Verified Findings
- `packages/harnesys/src/domain/agent-definition.ts:44` — `AgentGraph` requires exactly one `core:start` and at least one `core:end`.
- `packages/harnesys/src/application/validate.ts:137` — Validation checks `startIds.length !== 1`.

### Unverified Hypotheses (Need Confirmation)
- Cyclic graphs require `budget.maxSteps` or `budget.deadlineMs` — need to confirm behavior without budget.

### Gaps / Blockers
- No documentation for custom node types beyond `core:*` and `control:*` — need to check runtime behavior.

### Recommendations
1. [Action] — Based on: [finding reference]
```

## Anti-Patterns

| Anti-Pattern | Why It's Wrong |
|---|---|
| "Research shows..." without citation | Unverifiable — always cite `file:line` |
| Mixing facts and guesses | Confuses the reader — separate sections |
| Raw search dumps | Not synthesis — group by theme |
| No file paths in findings | Can't verify or act |
| "Experts say..." without name | Not evidence — cite the source file |
