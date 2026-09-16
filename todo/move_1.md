**Рекомендуемая архитектура**

Фичу следует разделить на две независимые операции:

1. **Обычный перенос файловой системы**
    - DnD в Explorer.
    - Перенос одного файла, нескольких выделенных файлов или папки.
    - Проверка циклического перемещения, конфликтов имён, попытки переместить каталог внутрь самого себя.
    - Обновление дерева, открытых вкладок, Git-статусов и watcher-событий.

2. **Рефакторинг ссылок**
    - После drop сервер строит `MovePlan`.
    - План содержит сам перенос, изменяемые файлы, diff, предупреждения и блокирующие ошибки.
    - Пользователь просматривает план.
    - Только после подтверждения применяется одна составная операция.

Пример потока:

```text
Explorer DnD
  -> POST /move/plan
  -> проверка путей
  -> AST-анализ импортов
  -> LSP references / definition / rename
  -> расчёт новых import specifiers
  -> MovePlan + diff
  -> пользователь подтверждает
  -> POST /move/apply
  -> запись файлов и перенос
  -> watcher обновляет Explorer
```

Ключевой объект:

```ts
type MovePlan = {
  id: string;
  workspaceId: string;
  sources: string[];
  destination: string;
  operations: MoveOperation[];
  edits: FileEdit[];
  blockers: MoveBlocker[];
  warnings: MoveWarning[];
  expiresAt: string;
};
```

`MovePlan` должен строиться относительно текущего состояния файлов. Перед применением сервер повторно проверяет хэши исходных файлов и существование путей. Если файл изменился после предпросмотра, применение блокируется и план нужно построить заново.

**Варианты реализации**

1. **LSP-first**
    - Использовать `textDocument/references` и `textDocument/rename`.
    - Минимум собственного анализа.
    - Зависимость от установленного языкового сервера и его корректной поддержки workspace.
    - Не подходит как единственный механизм: LSP не всегда возвращает строку импорта, а `rename` символа не равен переносу файла.

2. **AST + LSP fallback, рекомендую**
    - AST определяет импортные спецификаторы и позволяет безопасно заменить конкретные диапазоны текста.
    - LSP разрешает ссылки, aliases, barrel-файлы, project references и нестандартное разрешение модулей.
    - Если AST и LSP расходятся, операция получает blocker.
    - Для TypeScript/JavaScript можно начать с TypeScript Compiler API, включая `tsconfig` resolution и поддерживаемые формы `import`, `export ... from`, `require`, `import()`.
    - LSP-контракт расширяется операцией получения workspace edits либо остаётся Studio-локальным до отдельного согласования изменения публичного `harnesys` API.

3. **Текстовые правила**
    - Ищет относительные пути через regex.
    - Прост в реализации, но не понимает comments, strings, aliases, re-exports, package exports и динамические импорты.
    - Не соответствует выбранному требованию блокировать неоднозначные операции.

**Поддержка языков**

| Язык | Перенос | Автоматический import rewrite | Уровень |
|---|---:|---:|---|
| TypeScript | Да | Да | AST + TypeScript resolution + LSP |
| JavaScript | Да | Да | AST + TypeScript resolution + LSP |
| JSX / TSX | Да | Да | AST + TypeScript resolution + LSP |
| Python | Да | Позже | AST + Pyright/Pylance adapter |
| Go | Да | Позже | `gopls` workspace edit |
| Rust | Да | Позже | `rust-analyzer` workspace edit |
| Java / Kotlin | Да | Позже | Language-server adapter |
| C# | Да | Позже | Roslyn/LSP adapter |
| C / C++ | Да | Позже | clangd adapter |
| Ruby / PHP | Да | Позже | Отдельные parser/LSP adapters |

В первой версии следует объявить поддержку TypeScript, JavaScript, JSX и TSX. Остальные языки можно переносить как обычные файлы, но система не должна обещать автоматическое обновление импортов.

**Граница автоматической безопасности**

Применение блокируется, если обнаружено хотя бы одно из условий:

- импорт нельзя однозначно связать с перемещаемым файлом;
- обнаружен динамический импорт с неизвестным выражением;
- путь зависит от неизвестного alias или `package.json` exports;
- LSP вернул ссылку, которую AST не может сопоставить с текстовым диапазоном;
- файл изменился после построения плана;
- целевой путь занят;
- перенос создаёт цикл;
- часть операции находится за пределами workspace;
- есть generated/vendor/ignored-файлы, для которых rewrite запрещён политикой проекта.

При этом сам preview должен показывать все найденные ссылки: подтверждённые изменения, предупреждения и blockers. Пользователь не должен получать частично применённый перенос.

**Состав компонентов**

Клиент:

- `features/move-workspace-files`
    - DnD state.
    - Drop validation.
    - открытие preview dialog.
    - применение и отображение ошибок.
- `shared/api/files.ts`
    - `createWorkspaceMovePlan()`.
    - `applyWorkspaceMovePlan()`.
- `FileRow`
    - `draggable`.
    - drop target только для каталогов.
    - состояния valid, invalid, pending.
- preview dialog
    - список перемещаемых путей;
    - список изменяемых файлов;
    - inline diff;
    - blockers и warnings;
    - Apply / Cancel.

Сервер:

- `MoveWorkspaceFilesUseCase`
    - проверяет и применяет физический перенос;
- `CreateWorkspaceMovePlanUseCase`
    - собирает snapshot;
    - запускает resolver;
    - формирует edits и diff;
- `ApplyWorkspaceMovePlanUseCase`
    - повторно валидирует snapshot;
    - применяет edits и move;
    - публикует событие изменения;
- `WorkspaceFilesPort.move()`
    - добавить атомарное перемещение на уровне адаптера;
- `SourceReferenceAnalyzer`
    - общий orchestration-интерфейс;
- `TypeScriptReferenceAnalyzer`
    - AST и resolution для TS/JS;
- `LspWorkspaceEditAdapter`
    - нормализует результаты языкового сервера.

Физическую операцию лучше выполнять через временную staging-директорию или журнал обратных действий. Для локальной файловой системы `rename()` атомарен внутри одного filesystem, но пакетный перенос и изменение нескольких файлов сами по себе транзакцией не являются. При ошибке нужно либо откатывать уже выполненные операции, либо сохранять recovery plan и явно показывать незавершённое состояние.

**Что необходимо изменить в текущем коде**

Уже есть:

- рекурсивный Explorer в `apps/studio/client/src/widgets/workspace-sidebar/ui/files-section.tsx`;
- строка дерева в `file-row.tsx`;
- API списка, создания, удаления и записи файлов в `client/src/shared/api/files.ts`;
- `WorkspaceFilesPort` на сервере;
- watcher файлов;
- LSP-адаптер с `definition`, `references`, `diagnostics`, `hover`.

Понадобятся:

- `move()` в `WorkspaceFilesPort`;
- use cases плана и применения;
- HTTP endpoints для plan/apply;
- shared-типы `MovePlan`, `FileEdit`, `MoveBlocker`, `MoveWarning`;
- AST-анализатор TypeScript/JavaScript;
- расширение LSP-слоя workspace edits или Studio-local adapter;
- DnD в `FileRow`;
- preview/diff UI;
- синхронизация открытых редакторов после изменения путей;
- политика для `.git`, `node_modules`, generated и binary-файлов;
- server-side path containment checks для каждого источника и назначения.

**Рекомендуемый порядок разработки**

1. Безопасный DnD и обычный перенос файлов/папок без rewrite.
2. `MovePlan` и preview UI с физическим переносом одного файла.
3. AST-анализатор TS/JS для относительных imports и exports.
4. Применение пакетных текстовых edits вместе с переносом.
5. LSP-разрешение aliases, references и workspace edits.
6. Поддержка папок, barrel-файлов, `tsconfig` paths и project references.
7. Undo/recovery после стабилизации основного сценария.
8. Подключение Python, Go и Rust через отдельные language adapters.

Самый рискованный участок не DnD, а согласование AST-диапазонов, LSP-результатов и пакетной записи файлов. Для первой реализации я бы ограничил автоматическое изменение TS/JS импортами и re-export-ами, разрешёнными TypeScript resolver; все остальные случаи оставлял бы blocker-ами до появления соответствующего адаптера.