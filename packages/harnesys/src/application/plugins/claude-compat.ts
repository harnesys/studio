import matter from 'gray-matter';
import type {
  PluginHookCommand,
  PluginHookEvent,
  PluginLoadDiagnostic,
  PluginSourceFormat,
} from '../../domain/plugin.ts';
import {
  AGENT_PLUGINS_SCHEMA_ID,
  type ParsePluginManifestResult,
  PluginManifestError,
  parsePluginManifestJson,
} from './parse-plugin-manifest.ts';

export type PluginRootListing = string[];

export type PluginLayout = PluginSourceFormat | 'unknown';

export type ParseClaudeHooksResult = {
  hooks: PluginHookCommand[];
  diagnostics: PluginLoadDiagnostic[];
};

export type InventoryMarkdownFields = {
  name?: string;
  description?: string;
};

const SESSION_START_EVENT = 'SessionStart';

const MATCHER_EVENTS: Record<string, PluginHookEvent> = {
  startup: 'SessionStart:startup',
  clear: 'SessionStart:clear',
  compact: 'SessionStart:compact',
};

export function detectPluginLayout(rootListing: PluginRootListing): PluginLayout {
  for (const name of rootListing) {
    if (name === 'plugin.json') {
      return 'agent-plugins';
    }
  }
  for (const name of rootListing) {
    if (name === '.claude-plugin') {
      return 'claude-compat';
    }
  }
  return 'unknown';
}

export function parseClaudePluginManifestJson(raw: unknown): ParsePluginManifestResult {
  if (!isPlainObject(raw)) {
    throw new PluginManifestError('.claude-plugin/plugin.json must be a JSON object');
  }
  return parsePluginManifestJson({
    ...raw,
    $schema: AGENT_PLUGINS_SCHEMA_ID,
  });
}

export function parseClaudeHooksJson(raw: unknown, hooksFilePath?: string): ParseClaudeHooksResult {
  const diagnostics: PluginLoadDiagnostic[] = [];
  const hooks: PluginHookCommand[] = [];
  if (!isPlainObject(raw)) {
    diagnostics.push(
      hookDiagnostic('invalid_hook', 'hooks.json must be a JSON object', hooksFilePath),
    );
    return { hooks, diagnostics };
  }
  if (!isPlainObject(raw.hooks)) {
    diagnostics.push(
      hookDiagnostic('invalid_hook', 'hooks.json field "hooks" must be an object', hooksFilePath),
    );
    return { hooks, diagnostics };
  }

  for (const [eventName, entries] of Object.entries(raw.hooks)) {
    if (eventName !== SESSION_START_EVENT) {
      diagnostics.push(
        hookDiagnostic(
          'unsupported_hook_event',
          `unsupported hook event "${eventName}"`,
          hooksFilePath,
        ),
      );
      continue;
    }
    if (!Array.isArray(entries)) {
      diagnostics.push(
        hookDiagnostic('invalid_hook', `hooks.${eventName} must be an array`, hooksFilePath),
      );
      continue;
    }
    for (let i = 0; i < entries.length; i += 1) {
      collectSessionStartGroup(entries[i], {
        hooks,
        diagnostics,
        hooksFilePath,
        index: i,
      });
    }
  }

  return { hooks, diagnostics };
}

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

type SessionStartGroupContext = {
  hooks: PluginHookCommand[];
  diagnostics: PluginLoadDiagnostic[];
  hooksFilePath: string | undefined;
  index: number;
};

function collectSessionStartGroup(entry: unknown, ctx: SessionStartGroupContext): void {
  if (!isPlainObject(entry)) {
    ctx.diagnostics.push(
      hookDiagnostic(
        'invalid_hook',
        `hooks.SessionStart[${ctx.index}] must be an object`,
        ctx.hooksFilePath,
      ),
    );
    return;
  }

  const expanded = expandSessionStartMatcher(entry.matcher, ctx.hooksFilePath);
  ctx.diagnostics.push(...expanded.diagnostics);
  if (expanded.events.length === 0) {
    return;
  }

  if (!Array.isArray(entry.hooks)) {
    ctx.diagnostics.push(
      hookDiagnostic(
        'invalid_hook',
        `hooks.SessionStart[${ctx.index}].hooks must be an array`,
        ctx.hooksFilePath,
      ),
    );
    return;
  }

  for (let j = 0; j < entry.hooks.length; j += 1) {
    const parsed = parseCommandHook(entry.hooks[j], ctx.hooksFilePath, ctx.index, j);
    if (parsed.diagnostic !== undefined) {
      ctx.diagnostics.push(parsed.diagnostic);
      continue;
    }
    for (const event of expanded.events) {
      ctx.hooks.push({
        event,
        command: parsed.command,
        async: parsed.async,
      });
    }
  }
}

type ExpandedMatcher = {
  events: PluginHookEvent[];
  diagnostics: PluginLoadDiagnostic[];
};

function expandSessionStartMatcher(
  matcher: unknown,
  hooksFilePath: string | undefined,
): ExpandedMatcher {
  const diagnostics: PluginLoadDiagnostic[] = [];
  if (matcher === undefined || matcher === null || matcher === '' || matcher === '*') {
    return { events: [SESSION_START_EVENT], diagnostics };
  }
  if (typeof matcher !== 'string') {
    diagnostics.push(
      hookDiagnostic('invalid_hook', 'SessionStart matcher must be a string', hooksFilePath),
    );
    return { events: [], diagnostics };
  }

  const events: PluginHookEvent[] = [];
  const seen = new Set<PluginHookEvent>();
  for (const token of matcher.split('|')) {
    const key = token.trim();
    if (key.length === 0) {
      continue;
    }
    const event = MATCHER_EVENTS[key];
    if (event === undefined) {
      diagnostics.push(
        hookDiagnostic(
          'unsupported_hook_event',
          `unsupported SessionStart matcher "${key}"`,
          hooksFilePath,
        ),
      );
      continue;
    }
    if (!seen.has(event)) {
      seen.add(event);
      events.push(event);
    }
  }
  return { events, diagnostics };
}

type ParsedCommandHook =
  | { command: string; async: boolean; diagnostic?: undefined }
  | { diagnostic: PluginLoadDiagnostic; command?: undefined; async?: undefined };

function parseCommandHook(
  raw: unknown,
  hooksFilePath: string | undefined,
  groupIndex: number,
  hookIndex: number,
): ParsedCommandHook {
  const label = `hooks.SessionStart[${groupIndex}].hooks[${hookIndex}]`;
  if (!isPlainObject(raw)) {
    return {
      diagnostic: hookDiagnostic('invalid_hook', `${label} must be an object`, hooksFilePath),
    };
  }
  if (raw.type !== 'command') {
    const typeLabel = typeof raw.type === 'string' ? raw.type : String(raw.type);
    return {
      diagnostic: hookDiagnostic(
        'invalid_hook',
        `${label} unsupported hook type "${typeLabel}"`,
        hooksFilePath,
      ),
    };
  }
  if (typeof raw.command !== 'string' || raw.command.length === 0) {
    return {
      diagnostic: hookDiagnostic(
        'invalid_hook',
        `${label} requires a non-empty command string`,
        hooksFilePath,
      ),
    };
  }
  return { command: raw.command, async: raw.async === true };
}

function hookDiagnostic(
  code: string,
  message: string,
  hooksFilePath: string | undefined,
): PluginLoadDiagnostic {
  const diagnostic: PluginLoadDiagnostic = { level: 'warning', code, message };
  if (hooksFilePath !== undefined) {
    diagnostic.path = hooksFilePath;
  }
  return diagnostic;
}

function optionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
