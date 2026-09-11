import type { Plugin, PluginHookCommand } from '../../domain/plugin.ts';
import type { LlmNote, LlmNoteContext, LlmNoteProvider } from '../llm-notes.ts';
import { runPluginHookCommand } from './hooks-runner.ts';

export type PluginSessionStartSource = {
  plugin: Plugin;
  trusted: boolean;
  pluginData: string;
};

export type CreatePluginSessionStartNotesOptions = {
  plugins: PluginSessionStartSource[];
  timeoutMs: number;
};

export function parseSessionStartContext(stdout: string): string | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!isPlainObject(parsed)) {
    return undefined;
  }
  const nested = nestedAdditionalContext(parsed.hookSpecificOutput);
  if (nested !== undefined) {
    return nested;
  }
  const camel = nonEmptyString(parsed.additionalContext);
  if (camel !== undefined) {
    return camel;
  }
  return nonEmptyString(parsed.additional_context);
}

export function createPluginSessionStartNotes(
  options: CreatePluginSessionStartNotesOptions,
): LlmNoteProvider {
  const cache = new Map<string, Promise<LlmNote[]>>();
  return (ctx: LlmNoteContext) => {
    const existing = cache.get(ctx.runId);
    if (existing !== undefined) {
      return existing;
    }
    const pending = collectSessionStartNotes(options);
    cache.set(ctx.runId, pending);
    return pending;
  };
}

async function collectSessionStartNotes(
  options: CreatePluginSessionStartNotesOptions,
): Promise<LlmNote[]> {
  const notes: LlmNote[] = [];
  for (const source of options.plugins) {
    if (!source.trusted) {
      continue;
    }
    const text = await sessionStartText(source, options.timeoutMs);
    if (text === undefined) {
      continue;
    }
    notes.push({
      tag: `plugin-session-start:${source.plugin.manifest.name}`,
      text,
    });
  }
  return notes;
}

async function sessionStartText(
  source: PluginSessionStartSource,
  timeoutMs: number,
): Promise<string | undefined> {
  const parts: string[] = [];
  for (const hook of source.plugin.hooks) {
    if (!isStartupSessionStartHook(hook)) {
      continue;
    }
    const result = await runPluginHookCommand({
      pluginRoot: source.plugin.root,
      pluginData: source.pluginData,
      command: hook.command,
      timeoutMs,
    });
    if (!result.ok) {
      continue;
    }
    const context = parseSessionStartContext(result.stdout);
    if (context !== undefined) {
      parts.push(context);
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join('\n\n');
}

function isStartupSessionStartHook(hook: PluginHookCommand): boolean {
  return hook.event === 'SessionStart' || hook.event === 'SessionStart:startup';
}

function nestedAdditionalContext(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  return nonEmptyString(value.additionalContext);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
