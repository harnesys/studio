import type { PluginIr } from '../../domain/plugin-ir.ts';
import type { LlmNote, LlmNoteContext, LlmNoteProvider } from '../llm-notes.ts';
import { runPluginHookCommand } from './hooks-runner.ts';
import type { UserConfigContentOptions } from './user-config.ts';

export type PluginSessionStartSource = {
  ir: PluginIr;
  trusted: boolean;
  /** Exec-подстановка `${user_config.*}` в SessionStart command-хуков. */
  userConfig?: UserConfigContentOptions;
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
      tag: `plugin-session-start:${source.ir.identity.name}`,
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
  for (const component of source.ir.components) {
    if (component.kind !== 'hook' || component.status !== 'native') {
      continue;
    }
    if (!('binding' in component.spec)) {
      continue;
    }
    const binding = component.spec.binding;
    if (!isStartupSessionStartBinding(binding.event, binding.matcher)) {
      continue;
    }
    if (binding.handler.type !== 'command') {
      continue;
    }
    const result = await runPluginHookCommand({
      pluginRoot: binding.vars.pluginRoot,
      pluginData: binding.vars.pluginData,
      command: binding.handler.command,
      timeoutMs,
      userConfig: source.userConfig,
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

function isStartupSessionStartBinding(event: string, matcher?: string): boolean {
  if (event !== 'SessionStart') {
    return false;
  }
  return matcher === undefined || matcher === '' || matcher === '*' || matcher === 'startup';
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
