import type { Stats } from 'node:fs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PluginDiagnostic } from '../../../domain/plugin-diagnostics.ts';
import type { PluginComponent, SkillSpec } from '../../../domain/plugin-ir.ts';
import { parseSkillFile } from '../../skills/parse-skill-file.ts';
import { isPlainObject, type PathOverrideValue } from './manifest-result.ts';

/** Контекст discovery: корень плагина и его имя (префикс идентификаторов). */
export type DiscoverContext = {
  root: string;
  pluginName: string;
};

/** Диагностика о потерянной записи каталога. */
export function entryWarning(filePath: string, message: string): PluginDiagnostic {
  return { level: 'warning', code: 'invalid_component', message, path: filePath };
}

/** Куда discovery складывает результат: компоненты и диагностика. */
export type DiscoverySink = {
  components: PluginComponent[];
  diagnostics: PluginDiagnostic[];
};

/**
 * Skills: `skills/<name>/SKILL.md` (один уровень вложенности, AP §7.1)
 * плюс root `SKILL.md` как одиночный скилл (Claude). `extraDirs` —
 * дополнительные корни из path-override `skills` (Claude: дополняет дефолт).
 */
export function discoverSkillComponents(
  ctx: DiscoverContext,
  extraDirs: string[] = [],
): { components: PluginComponent[]; diagnostics: PluginDiagnostic[] } {
  const sink: DiscoverySink = { components: [], diagnostics: [] };
  const roots = [path.join(ctx.root, 'skills'), ...extraDirs];
  const seen = new Set<string>();
  for (const skillsRoot of roots) {
    if (seen.has(skillsRoot) || !isDirectory(skillsRoot)) {
      continue;
    }
    seen.add(skillsRoot);
    for (const name of listDir(skillsRoot, sink.diagnostics)) {
      const dir = path.join(skillsRoot, name);
      if (!isDirectory(dir)) {
        continue;
      }
      addSkillFromDir(ctx, dir, sink);
    }
  }
  const rootSkillFile = path.join(ctx.root, 'SKILL.md');
  if (isFile(rootSkillFile)) {
    addSkillFromFile(ctx, ctx.root, rootSkillFile, sink);
  }
  return sink;
}

function addSkillFromDir(ctx: DiscoverContext, dir: string, sink: DiscoverySink): void {
  const skillFile = path.join(dir, 'SKILL.md');
  if (!isFile(skillFile)) {
    return;
  }
  addSkillFromFile(ctx, dir, skillFile, sink);
}

function addSkillFromFile(
  ctx: DiscoverContext,
  dir: string,
  skillFile: string,
  sink: DiscoverySink,
): void {
  const content = readFile(skillFile, sink.diagnostics);
  if (content === undefined) {
    return;
  }
  try {
    const doc = parseSkillFile(content, skillFile);
    const spec: SkillSpec = { id: `${ctx.pluginName}:${doc.name}`, name: doc.name, dir };
    sink.components.push({
      kind: 'skill',
      spec,
      source: { file: relativeToRoot(ctx.root, skillFile), pointer: '$' },
      status: 'native',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    sink.diagnostics.push(entryWarning(skillFile, message));
  }
}

/** Path-override Claude: строка, список строк или inline-объект → список директорий. */
export function overrideDirs(root: string, value: PathOverrideValue | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  if (typeof value === 'string') {
    return [path.resolve(root, value)];
  }
  if (Array.isArray(value)) {
    return value.map((item) => path.resolve(root, item));
  }
  if (isPlainObject(value)) {
    return Object.values(value)
      .filter((item): item is string => typeof item === 'string')
      .map((item) => path.resolve(root, item));
  }
  return [];
}

/** Path-override Claude: inline-объект (имя → определение), если задан. */
export function overrideInlineObject(
  value: PathOverrideValue | undefined,
): Record<string, unknown> | undefined {
  return value !== undefined &&
    typeof value !== 'string' &&
    !Array.isArray(value) &&
    isPlainObject(value)
    ? value
    : undefined;
}

export function relativeToRoot(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

export function isDirectory(target: string): boolean {
  return tryStat(target)?.isDirectory() === true;
}

export function isFile(target: string): boolean {
  return tryStat(target)?.isFile() === true;
}

export function readFile(filePath: string, diagnostics: PluginDiagnostic[]): string | undefined {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diagnostics.push(entryWarning(filePath, message));
    return undefined;
  }
}

export function listDir(dir: string, diagnostics: PluginDiagnostic[]): string[] {
  try {
    return readdirSync(dir).sort();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    diagnostics.push(entryWarning(dir, message));
    return [];
  }
}

function tryStat(target: string): Stats | undefined {
  try {
    return statSync(target);
  } catch {
    return undefined;
  }
}
