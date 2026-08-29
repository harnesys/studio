---
name: writing-without-slop
description: >
  Use when writing or editing user-facing prose: chat replies, README, VISION,
  DECISIONS, design docs, PR descriptions, comments that explain, or any markdown.
  Use when text has an AI accent, sand-in-the-eyes readability, unedited model
  draft, em-dash advertising cadence, not-X-but-Y, cliffhanger headings, filler
  (важно отметить, let's dive in), slogans, always-three lists, or vague
  "research shows". Use when the user runs /writing-without-slop.
---

# Writing without slop

Source: ToxaBes, «Невыносимая слопность бытия», Habr, https://habr.com/ru/articles/1063010/

Using a model is fine. Shipping the unedited draft is the failure. The reader tires of **recognizable form**, not of grammar. Frequency of a device is the tell; one instance is ordinary writing.

Applies to Russian and English. Same contract for chat and for files.

## Output contract

Every reply and every markdown page is this, in order:

1. The fact, decision, or action.
2. The supporting detail the reader needs (names, numbers, identifiers, limits).
3. What you did not verify, if anything.

Ordinary punctuation: period, comma, colon, parentheses. Headings name the object (`ApiClient`, `handleRequest()`, `config.json`). A paragraph is 2–5 sentences. A section ends on a fact, constraint, or example.

## Before / after

```
# before
Сервис — это не просто API, а мощный инструмент, который меняет правила игры.

Давайте будем честны: переносимость играет ключевую роль.

Важно отметить: это не про код, а про данные. Система сохраняет снимок — и только так.
```

```
# after
Сервис компилирует JSON-конфиг в IR. Хост сохраняет snapshot до `commit()`.

Конфиг переносится как данные. Runtime состояние не хранит.
```

## Lexical markers (delete or replace)

RU: честный разбор, давайте будем честны, без воды, без купюр, откровенно говоря, спойлер, давайте погрузимся, играет ключевую/решающую роль, меняет правила игры, важно отметить, стоит подчеркнуть, уникальный, инновационный, революционный, непревзойденный, мощный инструмент, несомненно, безусловно, гармонично, комплексный подход, системно, является [оценкой] вместо глагола действия.

EN: delve, underscore, boast, meticulous, commendable, showcase, intricate, tapestry, let's dive in, deep dive, game-changer, plays a crucial/vital role, it's important to note, landscape, testament to, leverage, robust, seamless.

A human may use any of these once. A draft that stacks them is still a draft.

## Structural patterns

Edit for **rate**, not a total ban. Generic examples use placeholders like `Module`, `handleRequest()`, `config.json`.

| # | Pattern | What to write instead |
|---|---|---|
| 1 | Em dash (`—` / `--`) as the default comma, colon, or parenthesis; space before ` —` | Keep at most one real break of thought per several paragraphs. Elsewhere: comma, colon, parentheses, or two sentences. |
| 2 | Antithesis `не X, а Y` / `it's not X, it's Y` / `дело не в X` | State Y. At most one contrast per document, at the strongest point, never as the first sentence of a section. |
| 3 | One-line paragraph for fake drama (`А потом всё пошло не так.`) | One-sentence paragraphs only at a real turn. Otherwise join with the neighbor. |
| 4 | Staccato negations: series of single-sentence `Нет X.` / `Это не Y.` / `Ничего не делает.` | Merge into 2–3 sentence paragraphs with the reason or the limit. One bare negation closes a section, five create a slogan. |
| 5 | Cliffhanger headings (`Трещина в фундаменте`, `The hidden cost`, `Стоит ли брать`) | Heading = noun or artifact the section is about (`ApiClient`, `handleRequest()`, `Когда использовать модуль`). Check headings as a list apart from the body. Avoid question headings for reference docs. |
| 6 | Filler (`по сути`, `грубо говоря`, `казалось бы`, `таким образом`, `в итоге`, `furthermore`) | Delete if the sentence still means the same. Keep only a real caveat or a real transition. |
| 7 | Aphoristic closer after every block | Close with the next fact, a limit, a question that the next section answers, or an identifier (`status: done`, `limit: 100`, `file: config.json`). |
| 8 | Negation closer: every section ends with `X не входит`, `Y не делает`, `Z не существует` | End half the sections with what the component does, its inputs/outputs, or its limit. A bare `не входит` list without grouping is a tell. |
| 9 | Forced symmetry and rule of three (`инновационный, трансформирующий, прорывной`) | List as many items as exist (2, 4, 5). Break parallel syntax once: one short item, one long. |
| 10 | Concreteness decay: names and numbers in the first third, slogans in the last | Reread the last third alone. Put the same density of ids, numbers, and examples there. A long exclusion list without ids or commands is decay. |
| 11 | Vague authority (`исследования показывают`, `эксперты отмечают`, `стало поворотным моментом`) | Name the source, file, identifier, or measurement. If you cannot, cut the sentence. Empty authority is worse than silence. |
| 12 | Pseudo-sincerity (`без воды`, `честно говоря`, `you are a helpful assistant` tone) | Write the content. Do not advertise honesty, lack of ads, or a personal chat. |
| 13 | Colloquial register in specs (`гоняет`, `крутит`, `берите`, `тащит`, `не оффер`) | Use neutral verbs (`запускает`, `исполняет`, `используйте`, `передает`). Specs use indicative or infinitive, not familiar imperative. |

Copy-paste formatting (bold on every term, italic on every definition) is cheap to fix: mark identifiers with backticks, leave the rest roman. Group long exclusion lists by domain (execution, storage, extensions) and close each group with a reference.

## Three passes on a document

Chat replies: one pass of the self-check below.

Markdown / docs / long answers:

1. **Rhythm.** Count `—`, `не X, а Y`, one-liners, staccato negations (`Нет X.` chains), matching heading shapes. Break the cadence. Merge single-sentence negations into paragraphs with a reason.
2. **Concreteness.** Last third still has names, numbers, schema fields, commands. If the last section is a long exclusion list, group it and add ids or file references.
3. **Glue and closers.** Cut filler. Replace half the slogans and half the `не входит` closers with what the component does or its limit. Check register: no colloquial verbs in specs.

## Self-check (before send or commit)

- First sentence is a claim or an action, not a negation and not a trust pitch.
- `—` count: extra dashes became commas, colons, or new sentences.
- Contrast constructions: 0 or 1 in the whole piece.
- Headings: each contains a concrete noun or artifact name. No question headings in reference docs.
- Staccato check: no sequence of 3+ single-sentence `Нет X.` / `Это не Y.` paragraphs. Merged where found.
- Closers: at least half the sections end on a fact, limit, or identifier, not on `не входит` / `не делает`.
- Filler words: deleting them does not change the argument.
- Last third: still specific (ids, numbers, commands, file paths).
- Register: no colloquial verbs or familiar imperatives in specs.
- No "research shows" without a citation.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The dash is correct punctuation." | Legal once. Advertising cadence at every clause is the accent. |
| "Contrast makes the point sharper." | After the second `не X, а Y` the reader tracks the template, not the point. |
| "Short paragraphs improve scanability." | In a spec there is no plot. Fake beats and staccato `Нет X.` chains feel like tempo manipulation. |
| "A memorable closer helps." | The memorable unit is an identifier like `handleRequest` or `config.json`, not a proverb. |
| "Negation lists are exhaustive." | A bare `X не входит` without grouping or a reference hides what the component does. Group and close with a fact. |
| "Colloquial is more friendly." | Friendly tone in a spec reads as undocumented behavior. Neutral verbs keep the boundary explicit. |
| "Three bullets look complete." | Completeness is the items that exist. Padding to three is the rule-of-three tell. |
| "I already sound human enough." | Fluency at sentence level plus template at section level is exactly the fatigue. |

## Out of scope

Protocol identifiers, error strings, JSON examples, and quotes stay verbatim. Do not "humanize" a field name.

Do not add a detector, a score, or a claim that the text was or was not written by a model. Edit the form. Leave the facts.
