import type { PluginName } from '../../domain/plugin.ts';
import type { MonitorSpec, PluginIr } from '../../domain/plugin-ir.ts';
import type { BindDiagnosticSink } from './bind-agents.ts';
import { expandPluginVars } from './expand-plugin-vars.ts';

/** Условие запуска монитор job'а (спека §3 monitor). */
export type MonitorWhen = 'always' | `on-skill-invoke:${string}`;

/** Корни плагина для раскрытия плейсхолдеров в команде; хост берёт их из записи установки. */
export type MonitorExecContext = { pluginRoot: string; pluginData: string };

/**
 * Описатель job'а для планировщика хоста: библиотека только типизирует и
 * валидирует, исполнение (Studio scheduler) — на стороне хоста.
 */
export type MonitorJobSpec = {
  name: string;
  command: string;
  when: MonitorWhen;
  pluginId: PluginName;
};

const ON_SKILL_INVOKE = /^on-skill-invoke:(.+)$/;

/**
 * MonitorSpec → MonitorJobSpec: `when` валидируется (невалидная форма —
 * компонент отбрасывается с diagnostic), команда нормализуется раскрытием
 * `${PLUGIN_ROOT}`/`${PLUGIN_DATA}` и Claude-синонимов в абсолютные пути.
 */
export function bindMonitorComponents(
  ir: PluginIr,
  exec: MonitorExecContext,
  onDiagnostic?: BindDiagnosticSink,
): MonitorJobSpec[] {
  const jobs: MonitorJobSpec[] = [];
  for (const component of ir.components) {
    if (component.kind !== 'monitor' || component.status !== 'native') {
      continue;
    }
    const spec = component.spec as MonitorSpec;
    const when = parseMonitorWhen(spec.when);
    if (when === undefined) {
      onDiagnostic?.({
        level: 'warning',
        code: 'invalid_component',
        message: `monitor "${spec.name}": unknown when form "${spec.when}", component dropped`,
        path: component.source.file,
      });
      continue;
    }
    jobs.push({
      name: spec.name,
      command: expandPluginVars(spec.command, exec),
      when,
      pluginId: ir.identity.name,
    });
  }
  return jobs;
}

function parseMonitorWhen(raw: string | undefined): MonitorWhen | undefined {
  if (raw === undefined || raw === 'always') {
    return 'always';
  }
  return ON_SKILL_INVOKE.test(raw) ? (raw as MonitorWhen) : undefined;
}
