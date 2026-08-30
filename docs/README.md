# Harnesys docs

**Единственный SoT контракта.** Тема = один файл = один план реализации. Порядок номеров ≈ порядок внедрения.

Версии и milestones (engine freeze, Studio cutover): [ROADMAP.md](./ROADMAP.md). Studio переписывается на типы Harnesys нативно. `apps/studio/harnesys-stub` только для компиляции до ≥0.3: не референс для `packages/harnesys`.

Статус: RFC. Breaking допустим, пока пакет не объявлен stable. После engine freeze (**0.3.0**, см. ROADMAP) frozen surface только расширяется.

| # | Файл | Зависимости | Слой |
|---|---|---|---|
| 01 | [01-boundaries.md](./01-boundaries.md) | - | host/ядро, принципы |
| 02 | [02-agent-definition.md](./02-agent-definition.md) | 01 | `defineAgent`, типы нод |
| 03 | [03-expr-slots-edges.md](./03-expr-slots-edges.md) | 02 | Expr, слоты, рёбра, messages |
| 04 | [04-runtime-state.md](./04-runtime-state.md) | 01 | RuntimeState, cursor, intent/recorded |
| 05 | [05-create-runtime.md](./05-create-runtime.md) | 01, 04 | createRuntime, middleware, resolve |
| 06 | [06-models.md](./06-models.md) | 02, 05 | ProviderConfig, binding |
| 07 | [07-tools.md](./07-tools.md) | 05 | tool(), sideEffect |
| 08 | [08-validate-compile-check.md](./08-validate-compile-check.md) | 02, 03, 05–07 | коды ошибок |
| 09 | [09-graph-core.md](./09-graph-core.md) | 03–08 | run/start, llm, stream batch |
| 10 | [10-tool-call.md](./10-tool-call.md) | 07, 09 | batch, approve→interrupt |
| 11 | [11-control-assign-goto.md](./11-control-assign-goto.md) | 09 | assign, goto |
| 12 | [12-hitl-run-result.md](./12-hitl-run-result.md) | 04, 09, 10 | interrupt, Command, mismatch |
| 13 | [13-spawn-handoff-budget.md](./13-spawn-handoff-budget.md) | 05, 09, 12 | spawn, handoff, task, budget |
| 14 | [14-permissions.md](./14-permissions.md) | 05, 07, 12 | operations, middleware order |
| 15 | [15-paths.md](./15-paths.md) | 02, 05, 14 | FS allow ∩ cwd |
| 16 | [16-actions.md](./16-actions.md) | 07, 14, 15 | files/shell/http/ask_user |
| 17 | [17-skills.md](./17-skills.md) | 05 | SkillRegistry |
| 18 | [18-mcp.md](./18-mcp.md) | 05, 07, 14 | Cursor JSON, McpRegistry |
| 19 | [19-artifacts-attachments.md](./19-artifacts-attachments.md) | 05, 15 | ArtifactStore, fold |
| 20 | [20-session.md](./20-session.md) | 05, 12, 14–19 | session, AgentRun |
| 21 | [21-examples.md](./21-examples.md) | 09–13, 16 | fixtures |
| 22 | [22-events.md](./22-events.md) | 04, 09, 12 | event catalog |
| 23 | [23-later.md](./23-later.md) | - | post-v1 / не блокер сейчас |

Открытые решения планов:

- `17`: same-name skills last-wins; `skills: undefined` = все из registry.
