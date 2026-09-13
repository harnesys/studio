# Плагины: оверлей корней и бандл

Дата: 2026-09-13
Статус: согласовано с хозяином репо.

## Решения

Зафиксировано в обсуждении:

1. Корни плагинов по возрастанию приоритета: бандл (`apps/studio/assets/plugins/<name>`), дом (`~/.harnesys/plugins/<name>`), воркспейс (`<workspace>/.harnesys/plugins/<name>`). Одно имя разрешается в позднейший корень, как у скиллов (`skillRegistryRoots`, `apps/studio/server/src/adapters/store/studio-layout.ts:86-90`).
2. Установка по умолчанию идёт в корень воркспейса.
3. Бандл read-only, поставляется с приложением. Бандл-плагин включён в воркспейсе сам, гранты по умолчанию пустые.
4. Библиотека не меняется: `loadPluginIrFromDirectory` уже принимает произвольный `root`.

## Studio: сервер

Точки правки:

- `studio-layout.ts`: `bundledPluginsPath()` (образец `bundledSkillsPath`, там же `:44-46`), `systemPluginsPath(home)`, `workspacePluginsPath(workspacePath)` (образец `workspaceSkillsPath`, там же `:70-79`).
- `InstallPluginUseCase` и `PluginTreeInstaller` получают воркспейс вместо `home: string`.
- `PluginInstallRecord` (`apps/studio/server/src/domain/plugin.port.ts`) получает scope/origin: одно имя существует в трёх слоях.
- `enabledRecords` / `loadEnabledPlugins` (`workspace-harnesys.registry.ts:126-139,306-307`) выбирают победивший слой по имени.

## Не-цели

Миграция существующих `~/.harnesys/plugins`, судьба `marketplaces/`, селектор места установки в UI. Вопросы возвращаются при реализации.

## Проверка

Тесты в репо запрещены (`AGENTS.md`). Ручная проверка через agent-browser по портам хозяина (3000 API, 5173 Vite):

1. Бандл-плагин виден в воркспейсе без установки и enable.
2. Плагин воркспейса с тем же именем перекрывает системный и бандл.
3. Установка из UI кладёт checkout в `<workspace>/.harnesys/plugins/<name>`.

`bun run lint` в корне, typecheck пакетов после правок.
