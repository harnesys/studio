# Plugin system v2: упрощения и точки дожатия

Сопровождает `docs/spec/plugin-system-v2.md` и
`docs/plan/2026-09-12-plugin-system-v2.md`. Обновляется при каждом осознанном
отклонении от Claude plugins-reference / hooks-reference или agent-plugins.org
1.0.0. Цель — полная поддержка Claude-плагинов и AP 1.0 без переделок, которые
дороже самой поддержки.

## Критерий допуска упрощения

Упрощение попадает в v2 только при выполнении обоих условий:

1. Переделка до полной поддержки не ломает публичные типы библиотеки:
   `PluginIr`, `PluginComponent`, per-kind specs, `HookEventName`,
   `HookHandler`, `HookBus`.
2. Переделка не требует необратимой миграции SQLite и не меняет смысл уже
   записанных данных (grants, options, approvals).

Расширение проверяется добавлением члена union, поля, варианта источника или
таблицы. Если для паритета надо переименовать поле, перенести носитель или
сменить формат хранения — упрощение в v2 не допускается.

## Хуки: события

`HookEventName` содержит все 33 события Claude-контракта. Нативных швов — 16,
остальные 17 (включая `Setup`, `UserPromptExpansion`)
отдают diagnostic `event_unsupported` при enable. Дожатие — по одному шву:

- `PreModelSwitch`/`PostModelSwitch`, `WorktreeCreate`/`Remove`, `Elicitation*`,
  `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `InstructionsLoaded`,
  `StopFailure`, `TeammateIdle`, `TaskCreated`/`Completed`,
  `UserPromptExpansion`, `Setup`, `MessageDisplay` — каждый швом в движке плюс
  опциональное поле payload; существующие типы не меняются.

## Хуки: исполнение

- Shell-форма command-хендлеров. Claude исполняет command без `args` через
  `sh -c`; v2 токенизирует строку без шелла: кавычки поддержаны
  (`"${CLAUDE_PLUGIN_ROOT}"/scripts/x.sh` проходит), конструкции `|`, `&&`,
  `$VAR`, globs дают `invalid_command_form`. Большинство существующих
  Claude-плагинов проходит; полный паритет — отдельный вариант `HookHandler`
  с изолированным shell-исполнителем, union расширяется без ломки.
- Поле `if` (permission-rule на хендлере) вернётся вместе с hook-типом
  `agent`; поле опциональное, парсер расширяется аддитивно.
- `sessionTitle` поддержан: кап 200, тред переименовывается через
  `HookRuntimeCtx.renameSession` (хост пишет title). `watchPaths` игнорируется с
  warning; watch-лист вне workspace в `files-watcher.adapter.ts` — дожатие,
  контракт шва не меняется.
- `updatedInput`/`updatedToolOutput` заменяют объект целиком — сразу паритетно.
- HTTP allowlists Claude (`allowedHttpHookUrls`, `httpHookAllowedEnvVars`) —
  enterprise-механика; при появлении это настройка хоста, типы не затрагиваются.

## FileChanged

Матчёр фильтрует события по basename поверх общего workspace-watcher; Claude
регистрирует слежение только по именам из матчёра. Отклонение поведенческое:
лишние emit'ы гасятся фильтром и дебаунсом watcher'а. Шов
`bus.emit('FileChanged', ...)` неизменен; дожатие — доработка watcher'а,
домен не трогается.

## Установка и маркетплейс

- `command`-source и `headersHelper` — отказ: исполнение произвольного кода
  при разрешении каталога. `CatalogInstallSource` — открытый union, новый
  вариант добавляется без ломки. Полная поддержка требует sandbox-решения.
- `renames` и ограничения archive (https-only, zip, 256 MiB) сверить со
  страницами plugin-marketplaces до реализации F1; лимиты — константы хоста.
- `semver-lite` покрывает `~ ^ >= =`; полный semver заменяется реализацией за
  тем же интерфейсом, вызывающая поверхность — одна функция.

## Плагинные агенты

- `memory`/`background` → dropped (`unsupported_frontmatter_field`),
  `isolation: worktree` → diagnostic. Дожатие — поля `AgentDefinition`,
  аддитивно.
- `hooks`/`mcpServers`/`permissionMode` в plugin-агентах запрещены — паритет
  Claude, менять нечего.
- Hooks в SKILL.md и subagent frontmatter Claude активирует на время жизни
  скилла/субагента. v2 не делает; дожатие — точка активации в диспетчере
  скиллов, типы (`HookSpec`) готовы.

## MCP и LSP

- Scoped-имена `mcp__plugin_<name>_<server>__<tool>` и адресация
  `plugin:<name>:<server>` — сразу паритетные, переделка не потребуется.
- OAuth remote MCP — client-managed по AP; дожатие — адаптер авторизации
  в реестре серверов Studio.

## Гранты и approvals

- grants хранятся JSON-картой `{ workspaceId: classes }` на записи плагина;
  переезд в отдельную таблицу — дело репозитория, домен не меняется.
- approvals host-wide (подтверждение сервера действует на все workspace);
  per-workspace approvals при необходимости — новая таблица и расширение
  репо-методов.
- Матрица UI держит четыре статуса; `needs_server_approval` показывается
  причиной внутри blocked. Пятый статус при необходимости — аддитивный член
  union `ComponentStatus`.

## Мониторы

- Неперсистентны между рестартами сервера; `when: on-skill-invoke:<skill>`
  стартует джоб по первому инвоку скилла плагина в треде. Домен-тип
  (`MonitorSpec`) финален; поведение — политика хоста.

## Инварианты (не ломать при дожатии)

- `PluginIr`/`PluginComponent`: формат-нейтральность, `sourceFormat` не выходит
  за адаптеры.
- `HookEventName` — полный список Claude плюс события Harnesys-namespace
  (`PreModelCall`, `PostModelCall`, `NodeStart`, `NodeEnd`); новые события
  обоих родов добавляются в union аддитивно.
- Неймспейс `mcp__plugin_<name>_<server>__<tool>` и `plugin:<name>:<server>`.
- `PLUGIN_DATA` персистентен при update (AP §9.1); путь
  `~/.harnesys/plugins-data/<name>`.
- Имя плагина из манифеста/маркетплейса — ключ записей; миграций имени нет.
