import path from 'node:path';

import matter from 'gray-matter';
import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { AgentSpec, CommandSpec, PluginComponent } from '../../../domain/plugin-ir.ts';
import { PLANNED_CC_TOOLS } from '../../tool-aliases.ts';
import {
  type DiscoverContext,
  isDirectory,
  isFile,
  listDir,
  readFile,
  relativeToRoot,
} from './discover.ts';

/** Поля frontmatter plugin-агента, у модели есть носитель в AgentSpec. */
const AGENT_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  'name',
  'description',
  'model',
  'effort',
  'maxTurns',
  'tools',
  'disallowedTools',
  'skills',
  'memory',
  'background',
  'color',
]);

/** Frontmatter plugin-агента, у которого в v2 нет носителя: компонент теряет статус native. */
const FORBIDDEN_AGENT_KEYS: ReadonlySet<string> = new Set([
  'hooks',
  'mcpServers',
  'permissionMode',
]);

type InventoryMarkdownFields = {
  name?: string;
  description?: string;
};

/** Frontmatter markdown по образцу старого parseInventoryMarkdown: `matter(file)`. */
export function parseInventoryMarkdown(content: string): InventoryMarkdownFields {
  const parsed = matter(content);
  const data = parsed.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return {};
  }
  const record: Record<string, unknown> = { ...data };
  const fields: InventoryMarkdownFields = {};
  const name = optionalNonEmptyString(record.name);
  const description = optionalNonEmptyString(record.description);
  if (name !== undefined) {
    fields.name = name;
  }
  if (description !== undefined) {
    fields.description = description;
  }
  return fields;
}

/** Агенты `agents/*.md`: frontmatter по AgentSpec; отсутствующий frontmatter — имя по файлу (Claude-паритет: снисходительно). */
export function discoverAgentComponents(
  ctx: DiscoverContext,
  dirs: string[] = [path.join(ctx.root, 'agents')],
): { components: PluginComponent[]; diagnostics: PluginDiagnostic[] } {
  const components: PluginComponent[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  for (const dir of dirs) {
    if (!isDirectory(dir)) {
      continue;
    }
    for (const name of listDir(dir, diagnostics)) {
      if (!name.endsWith('.md')) {
        continue;
      }
      const file = path.join(dir, name);
      if (!isFile(file)) {
        continue;
      }
      const component = readAgentFile(ctx, file, diagnostics);
      if (component !== undefined) {
        components.push(component);
      }
    }
  }
  return { components, diagnostics };
}

/** Команды `commands/*.md` (плоские): команда-скилл `plugin:slug`. */
export function discoverCommandComponents(
  ctx: DiscoverContext,
  dirs: string[] = [path.join(ctx.root, 'commands')],
): { components: PluginComponent[]; diagnostics: PluginDiagnostic[] } {
  const components: PluginComponent[] = [];
  const diagnostics: PluginDiagnostic[] = [];
  for (const dir of dirs) {
    if (!isDirectory(dir)) {
      continue;
    }
    for (const name of listDir(dir, diagnostics)) {
      if (!name.endsWith('.md')) {
        continue;
      }
      const file = path.join(dir, name);
      if (!isFile(file)) {
        continue;
      }
      const stem = path.parse(name).name;
      let commandName = stem;
      const content = readFile(file, diagnostics);
      if (content !== undefined) {
        commandName = parseInventoryMarkdown(content).name ?? stem;
      }
      const spec: CommandSpec = { id: `${ctx.pluginName}:${commandName}`, name: commandName, file };
      components.push({
        kind: 'command',
        spec,
        source: { file: relativeToRoot(ctx.root, file), pointer: '$' },
        status: 'native',
      });
    }
  }
  return { components, diagnostics };
}

function readAgentFile(
  ctx: DiscoverContext,
  file: string,
  diagnostics: PluginDiagnostic[],
): PluginComponent | undefined {
  const content = readFile(file, diagnostics);
  if (content === undefined) {
    return undefined;
  }
  const stem = path.parse(file).name;
  let raw: Record<string, unknown> = {};
  try {
    const parsed = matter(content);
    raw = isRecord(parsed.data) ? parsed.data : {};
  } catch {
    // Claude-паритет: отсутствующий/unparseable frontmatter — именование по файлу.
  }

  const source = { file: relativeToRoot(ctx.root, file), pointer: '$' };
  const spec: AgentSpec = {
    id: `${ctx.pluginName}:${optionalNonEmptyString(raw.name) ?? stem}`,
    name: optionalNonEmptyString(raw.name) ?? stem,
    file,
  };
  const description = optionalNonEmptyString(raw.description);
  if (description !== undefined) {
    spec.description = description;
  }

  const diagnosticsLocal: PluginDiagnostic[] = [];
  let dropped = false;

  for (const key of Object.keys(raw)) {
    if (AGENT_FRONTMATTER_KEYS.has(key) || FORBIDDEN_AGENT_KEYS.has(key)) {
      continue;
    }
    diagnosticsLocal.push({
      level: 'warning',
      code: 'unsupported_frontmatter_field',
      message: `agent frontmatter field "${key}" is not supported and ignored`,
      path: source.file,
    });
  }
  for (const key of FORBIDDEN_AGENT_KEYS) {
    if (key in raw) {
      diagnosticsLocal.push({
        level: 'error',
        code: 'invalid_component',
        message: `plugin agent frontmatter field "${key}" is forbidden (Claude parity)`,
        path: source.file,
      });
      dropped = true;
    }
  }
  if ('isolation' in raw) {
    diagnosticsLocal.push({
      level: 'warning',
      code: 'unsupported_isolation',
      message: 'agent frontmatter field "isolation" is not supported and ignored',
      path: source.file,
    });
  }

  const model = optionalNonEmptyString(raw.model);
  if (model !== undefined) {
    spec.model = model;
  }
  const effort = optionalNonEmptyString(raw.effort);
  if (effort !== undefined) {
    spec.effort = effort;
  }
  const maxTurns = optionalNumber(raw.maxTurns);
  if (maxTurns !== undefined) {
    spec.maxTurns = maxTurns;
  }
  const tools = optionalStringList(raw.tools);
  if (tools !== undefined) {
    spec.tools = tools;
  }
  for (const name of spec.tools ?? []) {
    const note = PLANNED_CC_TOOLS[name];
    if (note !== undefined) {
      diagnosticsLocal.push({
        level: 'warning',
        code: 'unsupported_tool',
        message: `agent frontmatter tool "${name}" has no carrier yet (${note}); ignored`,
        path: source.file,
      });
    }
  }
  const disallowedTools = optionalStringList(raw.disallowedTools);
  if (disallowedTools !== undefined) {
    spec.disallowedTools = disallowedTools;
  }
  const skills = optionalStringList(raw.skills);
  if (skills !== undefined) {
    spec.skills = skills;
  }
  const memory = optionalNonEmptyString(raw.memory);
  if (memory !== undefined) {
    spec.memory = memory;
  }
  if (raw.background === true) {
    spec.background = true;
  }
  const color = optionalNonEmptyString(raw.color);
  if (color !== undefined) {
    spec.color = color;
  }

  diagnostics.push(...diagnosticsLocal);
  return {
    kind: 'agent',
    spec,
    source,
    status: dropped ? 'dropped' : 'native',
  };
}

function optionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalStringList(value: unknown): string[] | undefined {
  if (typeof value === 'string') {
    // Фронтматтер CC-доков пишет список одной запятой-строкой: "Glob, Grep, Read".
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
