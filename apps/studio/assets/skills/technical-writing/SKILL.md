---
name: technical-writing
description: Write clear prose for docs, PR descriptions, release notes, and chat-facing text without filler
when_to_use: "Any user-facing writing: docs, PRs, messages, design specs, skill instructions"
---
# Technical Writing Skill

## Core Contract: Start With Fact
Every block of text must begin with a fact, action, or identifier — not with filler, evaluation, or drama. The first sentence names the artifact or operation (`AgentGraph.compile()`, `PolicyHook`, `needs_commit`).

## Anti-Fillers (Ban These Phrases)
These phrases add no information — delete them unconditionally:
- "It's important to note that..."
- "As mentioned earlier..."
- "In this guide, we'll explore..."
- "Let's dive in..."
- "Leverage" / "utilize" / "harness" (use the direct verb: use, run, call, build)
- "Robust" / "seamless" / "game-changer" / "powerful" / "comprehensive"
- "By leveraging X, we can seamlessly achieve Y..." → "X produces Y."

## Punctuation Rules
- Default punctuation: `. , : ()` — use periods, commas, colons, parentheses.
- Em dash (`—`) is allowed as a connector ("under — over"), but never as a comma or colon replacement.
- Maximum one thought-break (em dash or line break) per section.
- Never use em dash as a dramatic pause more than once in a document.

## Contrast Rules
- `not X, but Y` — maximum one contrast per document, never the first sentence of a section.
- First sentence of any section must name the artifact or operation directly.

## Structure Template (Every Document)
Every user-facing document (README, spec, PR description, skill instructions) must include:

1. **Title** — names the artifact (`compile()`, `AgentDefinition`, `SKILL.md` format)
2. **Purpose** — one sentence describing the problem this solves
3. **Usage / Example** — code block or exact command
4. **Reference** — exact types, fields, parameters with names and file paths (`agent-definition.ts:55`)
5. **Constraints / Limitations** — exact limits, version requirements, compatibility

Keep sections focused. Each file should have one responsibility (~300 lines target). Large files doing multiple things signal split needs.

## Naming Rules
- Names stay present through the last third of any text block. Don't drop identifier references.
- Numbers must reference exact measurements or counts (`50 steps`, `300 lines`, `line 712`).
- Without specific numbers, claims are unverified.

## Verification Requirement
Before publishing any user-facing text:
- Check that every claim has a source: a file path, a measurement, or an explicit "not verified" marker.
- Check that no filler phrases remain.
- Check that the first sentence of each section starts with a fact.
