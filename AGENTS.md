# Harnesys agent rules


## Размер файлов

Файл — **не больше 300 строк**. Если можно вынести связный кусок — вынести. Без фанатизма: не дробить на файлы по 20 строк и не плодить обёртки «на один вызов».

Резать по ответственности, не по техническому типу. Плохо: `types.ts` + `utils.ts` + `helpers.ts` в одной куче. Хорошо: `model-fields.ts` (схема и draft), `model-dialogs.ts` (open/confirm), `model-fields.tsx` (поля), `model-dialogs.tsx` (диалоги).

Новый слой, хук, провайдер, порт или «generic Form» — только если уже есть второе такое же место, а не «пригодится».

## Типы

Не вытаскивай поле через индекс: `ModelRecord['cost']`, `Agent['quota']`, `Parameters<typeof fn>[0]`.
Заведи именованный тип (`ModelCost`, `AgentQuota`) рядом с записью и импортируй его.

Biome плагин `plugins/no-indexed-access-type.grit` ловит `T['field']` / `T["field"]`.
`Parameters<typeof fn>[0]` линтер не видит — тоже не пиши, заведи тип аргумента.

Допустимо: `(typeof CONST)[number]` в месте объявления союза; `T[K]` в дженерике по ключу.

Слайс FSD снаружи только через `index.ts` — ловит `noRestrictedImports` в `biome.json`.

## Тесты

**Тесты пока временно запрещены.** Не создавать `*.test.ts` / `*.spec.ts`, не ставить vitest / RTL / playwright. Если нужны логи или скрины запросить у человека.

## Как работать

- Спросить, если граница или тип неочевидны. Не угадывать слой.
- Смотреть соседний слайс той же роли и повторять его форму, не изобретать другую раскладку.
- Линт и формат — biome на весь монорепо.

### Стратегия: библиотека vs хост

Библиотека (`packages/harnesys`) — источник правды. Studio (`apps/studio`) — хост, который адаптируется к библиотеке, а не наоборот.

**Перед любым изменением типов/функций:**

2. **Проверить библиотеку** — возможно тип уже есть inline, под другим именем, или другой подход решает задачу. Не дублировать.
4. **Правило 80%** — если80% хостов напишут одно и то же сами → в библиотеку. Если специфично для одного хоста → в хост.
5. **Согласование** — ничего не добавлять без явного подтверждения. Сначала предложение → обсуждение → обновление документации → реализация.

**Запрещено:**
- Добавлять типы/функции в библиотеку без обсуждения
- Создавать "Studio-specific" типы — библиотека должна нативно покрывать потребности хоста
- Реализовывать то, чего нет в документации, без выноса на обсуждение

### Разговор и документы — жёстко

Нарушение любого пункта = стоп, не «чуть поправить».

1. **Не понял — один вопрос, стоп.** Не додумывать смысл. В документ и код не писать, пока смысл не подтвердили.
2. **Только то, что попросили в этом ходе.** Не расширять задачу. Соседнее «заодно», «под шумок», «пока фиксируем — приведу в порядок весь файл» — запрещено.
3. **Сначала цель: что делаем и зачем.** Пока цель не сказана человеком — не плодить разделы, типы и планы.
4. **Ответ = то, что спросили.** Запрещено: исповедь, «я ошибся», «документ не трогаю», непрошеный план, лишний вопрос после ответа.
5. **Поле, тип, раздел — только из просьбы, кода или уже согласованной доки.** Выдумку не канонизировать.
6. **«Не трогай документ» = ноль правок.** «Зафиксируй X» = правка только X, остальной текст не переписывать.
7. **Вопрос в чат ≠ разрешение редактировать.** Сначала ответ. Документ — когда сказали править и что именно.

| отговорка | нет |
|---|---|
| «это же очевидно» | спросить |
| «заодно приведу в порядок» | только запрошенное |
| «риск, чтобы сами не сделали» | не писать разговор с собой в документе |
| «два уточнения, проще сразу поправить спеку» | сначала ответ в чат |
| «сначала назвал, потом не-Y» | хвост «не Y» запрещён |

## Процессы и порты

**Дев-сервер Studio как правило уже запущен хозяином репозитория.** Перед любой проверкой в браузере или curl — посмотреть, слушают ли порты (`3000` API, `5173` Vite), и пользоваться ими.

- Не поднимать второй `studio` / Vite / bun --watch, если стенд уже жив.
- Не убивать, не рестартить и не перехватывать чужие процессы.
- Если порты свободны — сказать об этом и спросить, не стартовать самому без явной просьбы в этом ходе.

## Не делать

- Не запускать браузер для скриншотов или ручного тестирования без явного разрешения!!! Если нужен скриншот попроси тебе предоставят

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

When writing or editing markdown, read and apply `.agents/skills/writing-without-slop/SKILL.md` (three passes: rhythm, concreteness, glue/closers). Slash command: `/writing-without-slop`.
