---
name: writing-without-slop
description: >
Use when writing or editing user-facing prose: chat replies, READMEs, VISION
  statements, DECISIONS, design docs, PR descriptions, explanatory comments, or
  any Markdown. Use when the text has an "AI accent," gritty readability,
  unedited model drafts, em-dash-heavy marketing cadences, "not-X-but-Y"
  structures, cliffhanger headings, filler phrases (e.g., "it is important to
  note," "let's dive in"), slogans, "rule-of-three" lists, or vague
  "research shows" claims. Use when the user runs `/writing-without-slop`.
---

# Writing without slop

Source: ToxaBes, "The Unbearable Slop-ness of Being," Habr, https://habr.com/ru/articles/1063010/

Using a model is fine. Shipping the unedited draft is the failure. The reader tires of **recognizable patterns**, not of grammar. Frequency is the giveaway; a single instance is just ordinary writing.

Applies to both Russian and English. The same rules apply to chat messages and files.

## Output contract

Every reply and every Markdown page follows this order:

1. The fact, decision, or action.
2. The supporting details the reader needs (names, numbers, identifiers, limits).
3. What you did not verify, if anything.

Use standard punctuation: periods, commas, colons, parentheses. Headings name the object (`ApiClient`, `handleRequest()`, `config.json`). A paragraph is 2–5 sentences long. A section ends with a fact, constraint, or example.

## Before / after

```
# before
The service isn't just an API; it's a powerful tool that changes the game.

Let's be honest: portability plays a key role.

It is important to note: this isn't about code, but about data. The system saves a snapshot—and that is the only way.
```

```
# after
The service compiles the JSON config into IR. The host saves a snapshot before `commit()`.

The config is portable as data. It does not store runtime state.
```

## Lexical markers (delete or replace)

RU: honest breakdown, let's be honest, no fluff, no holds barred, frankly speaking, spoiler, let's dive in, plays a key/decisive role, game-changer, important to note, worth emphasizing, unique, innovative, revolutionary, unsurpassed, powerful tool, undoubtedly, certainly, harmoniously, comprehensive approach, systematically, is [an assessment] instead of an action verb.

EN: delve, underscore, boast, meticulous, commendable, showcase, intricate, tapestry, let's dive in, deep dive, game-changer, plays a crucial/vital role, it's important to note, landscape, testament to, leverage, robust, seamless.

A human may use any of these once. A draft that stacks them is still a draft.

## Structural patterns

Edit for **frequency**, not a total ban. Generic examples use placeholders like `Module`, `handleRequest()`, `config.json`.

| # | Pattern | What to write instead |
|---|---|---|
| 1 | Em dash (`—` / `--`) as the default comma, colon, or parenthesis; space before ` —` | Keep at most one real break of thought per several paragraphs. Elsewhere: comma, colon, parentheses, or two sentences. |
| 2 | Antithesis `not X, but Y` / `it's not X, it's Y` / `it's not about X` | State Y. At most one contrast per document, at the strongest point; never as the first sentence of a section. |
| 3 | One-line paragraph for fake drama (`And then everything went wrong.`) | One-sentence paragraphs only at a genuine turning point. Otherwise, merge with the adjacent paragraph. |
| 4 | Staccato negations: series of single-sentence `No X.` / `It's not Y.` / `It does nothing.` | Merge into 2–3 sentence paragraphs including the reason or limitation. A single bare negation can close a section; five of them create a slogan. |
| 5 | Cliffhanger headings ("A crack in the foundation," "The hidden cost," "Is it worth using?") | Heading = noun or artifact the section is about (`ApiClient`, `handleRequest()`, "When to use the module"). Check headings as a list separate from the body. Avoid question headings for reference docs. |
| 6 | Filler ("essentially," "roughly speaking," "seemingly," "thus," "ultimately," "furthermore") | Delete if the sentence retains the same meaning. Keep only a genuine caveat or a real transition. |
| 7 | Aphoristic closer after every block | Close with the next fact, a limit, a question answered by the next section, or an identifier (`status: done`, `limit: 100`, `file: config.json`). |
| 8 | Negation closer: every section ends with "X is not included," "Y does not do," "Z does not exist" | End half the sections with what the component *does*, its inputs/outputs, or its limit. A bare "not included" list without grouping is a telltale sign. |
| 9 | Forced symmetry and rule of three ("innovative, transformative, groundbreaking") | List as many items as actually exist (2, 4, 5). Break parallel syntax once: one short item, one long. |
| 10 | Concreteness decay: names and numbers in the first third, slogans in the last | Reread the last third in isolation. Ensure the same density of IDs, numbers, and examples there. A long exclusion list without IDs or commands represents decay. |
| 11 | Vague authority ("studies show," "experts note," "marked a turning point") | Name the source, file, identifier, or measurement. If you cannot, cut the sentence. Empty authority.