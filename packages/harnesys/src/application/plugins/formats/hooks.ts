import path from 'node:path';
import type { HookBinding, HookEventName, HookHandler } from '../../../domain/hook.ts';
import { NATIVE_HOOK_EVENTS } from '../../../domain/hook.ts';
import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { InertSpec, PluginComponent } from '../../../domain/plugin-ir.ts';
import {
  type DiscoverContext,
  entryWarning,
  isFile,
  overrideDirs,
  overrideInlineObject,
  readFile,
  relativeToRoot,
} from './discover.ts';
import { isPlainObject, type PathOverrideValue } from './manifest-result.ts';

/** Хендлеры, которые парсер умеет читать из манифеста; inline парсеры не производят. */
const HANDLER_TYPES: ReadonlySet<string> = new Set([
  'command',
  'http',
  'mcp_tool',
  'prompt',
  'agent',
]);

const NATIVE_EVENTS: ReadonlySet<string> = new Set<string>(NATIVE_HOOK_EVENTS);

export type DiscoverHooksOptions = {
  pluginData: string;
  override?: PathOverrideValue;
};

/**
 * `hooks/hooks.json` (namespace или корень) либо inline-override: ВСЕ события из
 * `HookEventName`; нативные → `HookBinding` c `origin: 'plugin'`, остальные →
 * компонент `dropped` с `event_unsupported`. Группа `{matcher, hooks:[…]}`
 * раскрывается в N биндингов.
 */
export function discoverHookComponents(
  ctx: DiscoverContext,
  options: DiscoverHooksOptions,
): { components: PluginComponent[]; diagnostics: PluginDiagnostic[] } {
  const components: PluginComponent[] = [];
  const diagnostics: PluginDiagnostic[] = [];

  const overridePaths = overrideDirs(ctx.root, options.override);
  const inline = overrideInlineObject(options.override);
  const candidates = [
    ...overridePaths.map((dir) => path.join(dir, 'hooks.json')),
    path.join(ctx.root, 'hooks', 'hooks.json'),
  ];
  let raw: unknown;
  let sourceFile: string | undefined;
  if (inline !== undefined) {
    raw = inline;
  } else {
    for (const candidate of candidates) {
      if (isFile(candidate)) {
        const content = readFile(candidate, diagnostics);
        if (content === undefined) {
          return { components, diagnostics };
        }
        try {
          raw = JSON.parse(content);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : String(cause);
          diagnostics.push(entryWarning(candidate, message));
          return { components, diagnostics };
        }
        sourceFile = candidate;
        break;
      }
    }
  }
  if (raw === undefined) {
    return { components, diagnostics };
  }
  const label = sourceFile === undefined ? 'hooks (inline)' : relativeToRoot(ctx.root, sourceFile);
  if (!isPlainObject(raw)) {
    diagnostics.push(entryWarning(label, 'hooks.json must be a JSON object'));
    return { components, diagnostics };
  }
  const hooksMap = isPlainObject(raw.hooks) ? raw.hooks : raw;

  for (const [eventName, groups] of Object.entries(hooksMap)) {
    if (!NATIVE_EVENTS.has(eventName)) {
      diagnostics.push({
        level: 'warning',
        code: 'event_unsupported',
        message: `hook event "${eventName}" has no runtime seam and is dropped`,
        path: label,
      });
      const spec: InertSpec = { raw: groups };
      components.push({
        kind: 'hook',
        spec,
        source: { file: label, pointer: eventName },
        status: 'dropped',
      });
      continue;
    }
    if (!Array.isArray(groups)) {
      diagnostics.push(entryWarning(label, `hooks.${eventName} must be an array`));
      continue;
    }
    for (let g = 0; g < groups.length; g += 1) {
      collectGroup(ctx, options, {
        components,
        diagnostics,
        label,
        event: eventName as HookEventName,
        group: groups[g],
        pointer: `${eventName}[${g}]`,
      });
    }
  }
  return { components, diagnostics };
}

type GroupContext = {
  components: PluginComponent[];
  diagnostics: PluginDiagnostic[];
  label: string;
  event: HookEventName;
  group: unknown;
  pointer: string;
};

function collectGroup(ctx: DiscoverContext, options: DiscoverHooksOptions, gc: GroupContext): void {
  if (!isPlainObject(gc.group)) {
    gc.diagnostics.push(entryWarning(gc.label, `${gc.pointer} must be an object`));
    return;
  }
  const matcher = gc.group.matcher;
  if (matcher !== undefined && typeof matcher !== 'string') {
    gc.diagnostics.push(entryWarning(gc.label, `${gc.pointer}.matcher must be a string`));
    return;
  }
  if (!Array.isArray(gc.group.hooks)) {
    gc.diagnostics.push(entryWarning(gc.label, `${gc.pointer}.hooks must be an array`));
    return;
  }
  for (let h = 0; h < gc.group.hooks.length; h += 1) {
    const entry = gc.group.hooks[h];
    const pointer = `${gc.pointer}.hooks[${h}]`;
    if (!isPlainObject(entry)) {
      gc.diagnostics.push(entryWarning(gc.label, `${pointer} must be an object`));
      continue;
    }
    const parsed = parseHandler(entry, gc.label, pointer, gc.diagnostics);
    if (parsed === undefined) {
      continue;
    }
    const binding: HookBinding = {
      id: `${ctx.pluginName}:${gc.event}:${sha1Short(canonicalJson(parsed.handler))}`,
      origin: 'plugin',
      event: gc.event,
      handler: parsed.handler,
      vars: { pluginRoot: ctx.root, pluginData: options.pluginData },
    };
    if (typeof matcher === 'string' && matcher.length > 0 && matcher !== '*') {
      binding.matcher = matcher;
    }
    gc.components.push({
      kind: 'hook',
      spec: { binding },
      source: { file: gc.label, pointer },
      status: parsed.status,
      ...(parsed.inertReason !== undefined ? { inertReason: parsed.inertReason } : {}),
    });
  }
}

type ParsedHandler =
  | { handler: HookHandler; status: 'native'; inertReason?: undefined }
  | { handler: HookHandler; status: 'inert'; inertReason: string };

function parseHandler(
  entry: Record<string, unknown>,
  label: string,
  pointer: string,
  diagnostics: PluginDiagnostic[],
): ParsedHandler | undefined {
  const type = entry.type;
  if (typeof type !== 'string' || !HANDLER_TYPES.has(type)) {
    diagnostics.push({
      level: 'warning',
      code: 'handler_type_unsupported',
      message: `${pointer}: unsupported or missing handler type`,
      path: label,
    });
    return undefined;
  }
  for (const key of Object.keys(entry)) {
    if (!HANDLER_FIELD_KEYS.has(key)) {
      diagnostics.push({
        level: 'warning',
        code: 'unsupported_frontmatter_field',
        message: `${pointer}: handler field "${key}" is not supported and ignored`,
        path: label,
      });
    }
  }
  const timeoutS = pickTimeoutS(entry);
  const common = {
    ...(timeoutS !== undefined ? { timeoutS } : {}),
  };
  switch (type) {
    case 'command': {
      if (typeof entry.command !== 'string' || entry.command.length === 0) {
        diagnostics.push(entryWarning(label, `${pointer}: command must be a non-empty string`));
        return undefined;
      }
      const handler: HookHandler = {
        type: 'command',
        command: entry.command,
        ...common,
        ...(entry.async === true ? { async: true } : {}),
        ...(isRecordValue(entry.env) ? { env: stringMap(entry.env) } : {}),
      };
      if (Array.isArray(entry.args) && entry.args.every((item) => typeof item === 'string')) {
        handler.args = entry.args;
      } else if ('args' in entry) {
        diagnostics.push(entryWarning(label, `${pointer}: args must be an array of strings`));
      }
      return { handler, status: 'native' };
    }
    case 'http': {
      if (typeof entry.url !== 'string' || entry.url.length === 0) {
        diagnostics.push(entryWarning(label, `${pointer}: url must be a non-empty string`));
        return undefined;
      }
      const handler: HookHandler = {
        type: 'http',
        url: entry.url,
        ...common,
        ...(isRecordValue(entry.headers) ? { headers: stringMap(entry.headers) } : {}),
      };
      return { handler, status: 'native' };
    }
    case 'mcp_tool': {
      if (typeof entry.server !== 'string' || typeof entry.tool !== 'string') {
        diagnostics.push(entryWarning(label, `${pointer}: mcp_tool requires server and tool`));
        return undefined;
      }
      const handler: HookHandler = {
        type: 'mcp_tool',
        server: entry.server,
        tool: entry.tool,
        ...common,
        ...(isRecordValue(entry.input) ? { input: stringMap(entry.input) } : {}),
      };
      return { handler, status: 'native' };
    }
    case 'prompt':
    case 'agent': {
      if (typeof entry.prompt !== 'string' || entry.prompt.length === 0) {
        diagnostics.push(entryWarning(label, `${pointer}: prompt must be a non-empty string`));
        return undefined;
      }
      const handler: HookHandler = {
        type,
        prompt: entry.prompt,
        ...common,
        ...(typeof entry.model === 'string' ? { model: entry.model } : {}),
      };
      if (type === 'agent') {
        return { handler, status: 'inert', inertReason: 'needs_verifier_runtime' };
      }
      return { handler, status: 'native' };
    }
    default:
      return undefined;
  }
}

function stringMap(value: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      out[key] = item;
    }
  }
  return out;
}

const HANDLER_FIELD_KEYS: ReadonlySet<string> = new Set([
  'type',
  'command',
  'args',
  'url',
  'headers',
  'server',
  'tool',
  'input',
  'prompt',
  'model',
  'timeout',
  'timeoutS',
  'async',
  'env',
]);

function pickTimeoutS(entry: Record<string, unknown>): number | undefined {
  if (typeof entry.timeoutS === 'number' && Number.isFinite(entry.timeoutS)) {
    return entry.timeoutS;
  }
  if (typeof entry.timeout === 'number' && Number.isFinite(entry.timeout)) {
    return entry.timeout;
  }
  return undefined;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Стабильная сериализация: отсортированные ключи, для id-хэша биндинга. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (isRecordValue(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortValue(value[key]);
    }
    return out;
  }
  return value;
}

function sha1Short(text: string): string {
  const hasher = new Bun.CryptoHasher('sha1');
  hasher.update(text);
  return hasher.digest('hex').slice(0, 8);
}
