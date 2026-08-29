# Harnesys agent rules

## Prose (chat, docs, PRs, comments)

Unedited model cadence is not acceptable in this repo. Using a model to draft is fine; publishing the draft is not.

**Always-on contract** (Russian and English):

- Open with the fact, decision, or action. Supporting detail second. Unverified items last.
- Punctuation default: `. , : ()`. The em dash (`—`) is a rare break of thought, not a substitute for comma or colon. Space-padded ` — ` is a tell; do not use it.
- State the thing. `не X, а Y` / `it's not X, it's Y` at most once per document, never as the first sentence of a section.
- Headings name the artifact or operation (`PolicyHook`, `compile()`, `needs_commit`). No metaphor-plus-drama titles.
- Delete filler that does not change the claim: `по сути`, `важно отметить`, `таким образом`, `it's important to note`, `let's dive in`, `leverage`, `robust`, `seamless`, `game-changer`, `мощный инструмент`, `комплексный подход`.
- Prefer an action verb over `является` / `is a [adjective] solution`.
- End a block with a fact, limit, identifier, or example. Not a slogan.
- List as many items as exist. Do not pad to three matching phrases.
- Keep names, numbers, and schema fields through the last third of the text.
- Attribute: cite the source, file, or measurement, or say you did not verify. Cut `исследования показывают` / `experts say` with no name.

**Do this on every user-facing paragraph**, including this chat.

When writing or editing markdown, read and apply `.grok/skills/writing-without-slop/SKILL.md` (three passes: rhythm, concreteness, glue/closers). Slash command: `/writing-without-slop`.
