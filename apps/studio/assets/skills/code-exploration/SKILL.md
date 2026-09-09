---
name: code-exploration
description: Map unfamiliar codebases from entry points, manifests, and directory layout; report risks
when_to_use: Before any edit in an unfamiliar workspace
---
# Code Exploration Skill

## Approach
Start from high-level structures before reading random files. Never edit without exploring first.

### 1. Manifest and Dependencies
Read package manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, etc. — whatever the workspace uses). Note:
- Project name and purpose
- Key dependencies (runtime library vs host application)
- Scripts (`dev`, `build`, `lint`, `typecheck`)
- Module type (`ESM`, `CommonJS`, etc.)

### 2. Directory Layout
Understand module boundaries before diving into code:
- Where is the runtime? Where is the host?
- Where are domain definitions vs adapters vs UI?
- What is the import direction (downward or circular)?

### 3. Entry Points
Identify the main entry (`index.ts`, `main.ts`, `app/`, `pages/`, etc.). Read it briefly to understand the initialization flow.

### 4. Key Domain Modules
Find the files that define core types, ports, and errors. Read the type definitions first — they explain the data model. Then find the use cases and adapters.

### 5. Extension Points
Identify how the system extends:
- Ports/interfaces that external components implement
- Registry adapters (skill registry, tool registry, model registry)
- Configuration points (`config/constants`, `.env`, workspace meta)

## Output Template (Mandatory)
Every exploration must deliver:

```markdown
## Exploration Brief: [Workspace/Module]

### Structure
- Entry points: [file paths]
- Domain modules: [file paths with 1-line purpose]
- Host/adapter layers: [file paths]
- Config/extension points: [paths]

### Key Types / Ports
- `TypeName` (`file:line`) — [1-line description]

### Data Flow (Brief)
[Request → Adapter → Use Case → Domain → Response, or Event flow]

### Extension Points
- [Port name] — implemented by [adapter file]
- [Registry] — registered in [composition file]

### Verified Findings
- `file.ts:line` — [exact observation from code]

### Hypotheses (Unverified)
- [Observation that needs confirmation] — Check: [how to verify]

### Risks
- [Risk] — `file:line` — [why it matters for the task]

### Recommended Next Actions
1. [Concrete next step with file/path reference]
```

## Anti-Patterns

| Wrong Approach | Correct Approach |
|---|---|
| Random file reading | Start with manifest → directory → entry points |
| No file paths in findings | Every claim needs `file:line` citation |
| Editing before exploring | Always explore first — even for "simple" fixes |
| Mixing verified and unverified claims | Separate sections: Verified / Hypotheses |
| No risk identification | Always call out coupling, migration needs, missing docs |
