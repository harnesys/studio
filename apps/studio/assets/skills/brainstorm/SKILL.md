---
name: brainstorm
description: Brainstorm ideas into fully formed designs before any implementation
when_to_use: Before any creative work - new features, components, behavior changes, or system modifications
---
# Brainstorming Ideas Into Designs

## The Hard Gate

DO NOT invoke any implementation skill, scaffold any project, or write any implementation code until you have told your human partner what you intend and they have approved it. This applies to EVERY task — the approval gate never skips.

## Three Paths

Before any action, announce your path out loud so your human partner can override:

**Spike** — a feasibility probe. The output is a recommendation, not code you keep. Present the question and plan in 2-3 sentences, get approval, then investigate as cheaply as correctness allows. Report findings with a clear recommendation. Label anything built as throwaway.

**Bounded** — a well-scoped change to existing code. If no existing flow exists to change, this is NOT bounded — upgrade to architectural. Ask the clarifying questions that matter, present a short design IN CHAT (a few sentences to short paragraphs), and STOP. Implementation starts only after an explicit "yes".

**Architectural** — new subsystems or restructuring that alters interfaces others depend on. Follow the full process: questions, approaches with trade-offs, sectioned design approval per section, written spec in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, spec self-review (placeholder scan, consistency check, scope check, ambiguity check), user review, then invoke `writing-plans` for the implementation plan.

When in doubt between paths, take the heavier one. Hidden complexity discovered mid-task upgrades the path — stop and say so.

## Red Flags — Rationalizations That Skip the Gate

| Rationalization | Reality |
|----------------|---------|
| "This is too simple to need a design" | Simple means a short design (2 sentences), not zero design. Approval is mandatory. |
| "I'll call it bounded and skip the spec" | Reaching for a label to skip work IS the doubt — take the heavier path. |
| "It's bounded and the design is obvious — I'll start while they read" | The gate is approval, not design length. Present, then stop until you hear yes. |
| "This is a quick spike, I'll keep the working code" | Spike output is an answer. Keeping the code is a new task — classify it separately. |
| "It grew, but I'm almost done — no need to re-classify" | Hidden complexity upgrades the path. Stop, announce the upgrade, and step up. |

## Checklist Per Path

**Spike:**
1. Explore context (files, docs, recent commits)
2. Present question + probe plan (2-3 sentences)
3. Get approval (explicit nod)
4. Investigate (cheapest correct approach)
5. Report recommendation (label anything built as throwaway)

**Bounded:**
1. Explore existing flow (read files, understand conventions)
2. Ask clarifying questions (one at a time)
3. Present short design in chat (approach, files touched, verification)
4. Get approval (STOP — wait for explicit yes)
5. Implement (normal workflow, no spec document needed)

**Architectural:**
1. Explore context
2. Assess scope — if multiple independent subsystems, decompose first
3. Ask clarifying questions (one message per question)
4. Propose 2-3 approaches with trade-offs and your recommendation (lead with recommended option)
5. Present design sections — ask after each section if it looks right
6. Write spec to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
7. Spec self-review (placeholder, consistency, scope, ambiguity)
8. User reviews written spec — wait for approval
9. Invoke `writing-plans` skill for detailed implementation plan

## Key Principles

- **Isolation and clarity**: Break the system into units with one clear purpose, well-defined interfaces, and independent testability. If internals change without breaking consumers, boundaries are good. Large files doing multiple things signal split responsibility.
- **Follow existing patterns**: In existing codebases, follow conventions. Targeted improvements to code being modified are appropriate; unrelated refactoring is not.
- **YAGNI ruthlessly**: Remove unnecessary features from every approach. Only add layers/hooks/providers after a second use case exists.

## Process Flow

The only skill invoked after architectural approval is `writing-plans`. Never invoke `frontend-design`, `subagent-driven-development`, or any other implementation skill before that transition.
