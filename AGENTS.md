# Harnesys agent rules

## Allowed paths

File operations — only inside:

- `~/Projects/Harnesys/**/*`
- `~/.harnesys/**/*`

Nowhere else: read, write, `ls`, scripts, diagnostic files. Temporary files — inside these trees, not in system tmp.

## Skills

Superpower skills — not a ritual for every little thing. Where the task is solved quickly and directly, work without them. SDD skills (brainstorming, writing-plans, subagent-driven-development) — only for specifically new features or a clearly complex bug.

**agent-browser** — can and should be used for manual Studio checks in browser (clicks, forms, scenarios, screenshots during verification). Read the skill before work (`agent-browser skills get core`). Dev server ports — see “Processes and ports”; do not spin up or kill someone else’s stand.

## File size

Target: about 300 lines desirable. A cohesive file that barely fits 300 can stay. Split it by someone who can open a neighboring file of the same responsibility.

Split by responsibility, not by technical layer. Bad: `types.ts` + `utils.ts` + `helpers.ts` in one pile. Good: `model-schema.ts` (fields and draft), `model-form.tsx` (form fields), `model-dialogs.tsx` (dialogs).

New layer, hook, provider, port or “generic Form” — only if there is already a second such place, not “might be useful”.

## Types

Do not extract a field via index: `ModelRecord['cost']`, `Agent['quota']`, `Parameters<typeof fn>[0]`.
Create a named type (`ModelCost`, `AgentQuota`) next to the record and import it. Aliases are wrappers, not a copy of knowledge: source of truth remains the record.

Biome plugin `lint/plugins` (monorepo root) catches `T['field']` and `T["field"]`.
`Parameters<typeof fn>[0]` and `(typeof CONST)[number]` linter does not see, but also do not write: create an argument type or name a union.

`T[K]` in generic by key is allowed.

FSD slice outside only via `index.ts` — caught by `noRestrictedImports` in `apps/webui/biome.json`.

## Tests

**Tests are temporarily forbidden.** Do not create `*.test.ts` / `*.spec.ts`, do not install vitest / RTL / playwright. If logs or screenshots are needed, ask the person.

## How to work

- Ask if boundary or type is unclear. Do not guess layer.
- Look at neighboring slice of same role and repeat its form, do not invent a different layout.
- Lint: general `biome.json` in root; packages inherit via `"extends": "//"` and keep only overrides. `bun run lint` in root or in package.

### Strategy: library vs host

Library (`packages/harnesys`) — source of truth. Host (`apps/server`) — adapts to library, not vice versa.

**Before any change to types or functions:**

1. **Check library.** Possibly type already exists under different name, or another approach solves the task. Do not duplicate.
2. **Generalize first.** Look for formulation that covers need without host binding. 80% rule: if most hosts would solve task the same way, it goes to library.
3. **Private — in host.** If task does not generalize honestly, leave solution in Studio until a second consumer appears. Studio type is not a reason to change library API.
4. **Agreement.** Do not add anything without explicit confirmation. Order: proposal → discussion → documentation update → implementation.

**Forbidden:**
- Change or add public types and functions of library without discussion
- Change library API for one host need if a generalized formulation exists
- Implement something not in documentation without bringing up for discussion

### Conversation and documents — strict

Violation of any item = stop, not “fix a bit”.

1. **Didn't understand — one question, stop.** Do not guess meaning. Do not write to document and code until meaning is confirmed.
2. **Only what was asked in this turn.** Do not expand task. Neighboring “by the way”, “while fixing — tidy whole file” — forbidden.
3. **Goal first: what we do and why.** While person has not stated goal — do not create sections, types and plans.
4. **Answer = what was asked.** Forbidden: confession, “I’m not touching document”, unsolicited plan, extra question after answer. If you notice discrepancy between task and reality — say it in one line and wait for decision.
5. **Field, type, section — only from request, code or already agreed docs.** Do not canonize invention.
6. **“Don’t touch document” = zero edits.** “Fix X” = edit only X, do not rewrite rest of text.
7. **Question in chat ≠ permission to edit.** First answer. Document — when told to fix and what exactly.

| excuse | no |
|---|---|
| “it's obvious” | ask |
| “I'll tidy up while at it” | only requested |
| “risk they won't do it themselves” | do not write self-talk in document |
| “two clarifications, easier to just fix spec” | first answer in chat |
| “first named, then not-Y” | tail “not Y” forbidden |

## Processes and ports

**Dev server Studio is usually already running by repo owner.** Before any browser or curl check — see if ports are listening (`47474` API, `5173` Vite), and use them.

- Do not spin up second `studio` / Vite / bun --watch if stand is alive.
- Do not kill, restart or hijack other processes.
- If ports are free — say so and ask; do not start yourself without explicit request in this turn.

## Do not

- Do not replace manual verification via agent-browser with autotests (`*.test.ts` / playwright etc.) — unit/e2e tests are still forbidden by separate item above.

RULE D1: DELETION IS ALWAYS CASCADING.
When instructed to remove a feature, an enum member, a type, a function, or a module, you MUST trace and remove every artifact that depends on it. This includes:

All switch/case branches, if/else blocks, and pattern matches that reference the removed item.

All callers (direct and indirect), including callers in other modules, packages, and test files.

All re-exports, barrel files (index.ts, mod.rs, __init__.py), and public API surface entries.

All associated tests, fixtures, mocks, and documentation that exclusively cover the removed functionality.

All associated types, interfaces, constants, and configuration keys that were created solely to support the removed item.

RULE D2: NEVER REPLACE DELETED LOGIC WITH NEW CONDITIONALS.
If you remove an enum member, do NOT add if (x === RemovedMember) guards. If you remove a function, do NOT add a stub that throws NotImplementedError unless explicitly requested. The goal is subtraction, not substitution. Adding new branches to handle the absence of removed code is forbidden and will be treated as a failed task.

RULE D3: VERIFY THE ABSENCE BEFORE COMMITTING.
After performing a deletion, you MUST verify that no residual references remain. Run the project's type checker, linter, and test suite. Specifically:

Use the language server's "find all references" or an equivalent tool (e.g., grep, rg) for the removed symbol names.

Confirm that the build passes without warnings about unused imports or unreachable code.

If a test fails because it was testing the removed functionality, delete that test. Do not modify the test to test something else.

RULE D4: RE-EXPORTS AND BARREL FILES ARE PART OF THE API SURFACE.
When removing a symbol, check every file that re-exports it. Remove the re-export line entirely. Do not leave a commented-out export or a re-export of a non-existent symbol. If a barrel file becomes empty, delete the barrel file and update its importers.

RULE D5: DEAD CODE MUST BE DELETED, NOT COMMENTED OUT.
Never comment out removed code "for reference." Never leave // removed: X comments. If the removal is correct, the code is gone. Version control is the reference.

RULE D6: DO NOT INTRODUCE BACKWARD-COMPATIBILITY SHIMS.
Unless the user explicitly asks for a deprecation path, do not create aliases, wrapper functions, or migration adapters for the removed functionality. A hard cut is the default. If the user wants a soft deprecation, they will specify it.

RULE D7: UPDATE ALL DOCUMENTATION AND CONFIGURATION.
If the removed functionality was mentioned in README.md, docs/, OpenAPI specs, JSON schemas, feature flag definitions, or CI configuration, remove those mentions in the same change. Stale documentation is a bug.

RULE D8: IF UNCERTAIN, ASK BEFORE ADDING.
If tracing the full dependency chain reveals an ambiguity (e.g., a symbol is used in a context you cannot fully analyze), STOP and ask the user for clarification. Do NOT guess by adding a defensive if or a try/catch. The default action when uncertain is to ask, not to invent.

## Prose (chat, documents, PR, comments)

Unedited model rhythm in repository is unacceptable. Model as draft — ok; publishing draft — no.

**Permanent contract** (Russian and English):

- Start with fact, decision or action. Details — second layer. Unverified — at the end.
- Default punctuation: `. , : ()`. Em dash `—` as subject = predicate connector in Russian — normal and not counted. `—` as comma or colon replacement — rarely: no more than one thought break per several paragraphs.
- `not X, but Y` — no more than one contrast per document, never first sentence of section.
- Headings name artifact or operation (`PolicyHook`, `compile()`, `needs_commit`). No dramatic metaphor.
- Remove fillers that do not change statement: `in essence`, `important to note`, `thus`, `it's important to note`, `let's dive in`, `leverage`, `robust`, `seamless`, `game-changer`, `powerful tool`, `comprehensive approach`.
- Action verb instead of `is a [evaluation]` / `is a [adjective] solution`.
- End block with fact, limitation, identifier or example, not slogan.
- List as many items as there are. Do not pad to three.
- Keep names, numbers and schema fields to the last third of text inclusive.
- Reference source: cite file, measurement, or say you did not check. `research shows` / `experts say` without name — remove.

**Do this in every user paragraph**, including this chat.

When writing and editing markdown read and apply `.agents/skills/writing-without-slop/SKILL.md` (three passes: rhythm, concreteness, connectors and endings). Slash command: `/writing-without-slop`.
