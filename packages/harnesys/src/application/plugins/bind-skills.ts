import { dirname } from 'node:path';
import matter from 'gray-matter';
import { FsSkillRegistry } from '../../adapters/fs-skill-registry.ts';
import type { CommandSpec, PluginIr } from '../../domain/plugin-ir.ts';
import type { SkillDocument, SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { composeSkillRegistries } from '../skills/compose-skill-registries.ts';
import { prefixSkillRegistry } from './prefixed-skill-registry.ts';
import type { UserConfigContentOptions } from './user-config.ts';
import { substituteUserConfigContent } from './user-config.ts';
export type SkillFileReader = (file: string) => string;
export function bindSkillComponents(
  ir: PluginIr,
  readSkillFile: SkillFileReader,
  userConfig?: UserConfigContentOptions,
): SkillRegistry {
  const roots = new Set<string>();
  const commands: CommandSpec[] = [];
  for (const component of ir.components) {
    if (component.status !== 'native') {
      continue;
    }
    if (component.kind === 'skill' && 'dir' in component.spec) {
      roots.add(dirname(component.spec.dir));
    }
    if (component.kind === 'command' && 'file' in component.spec) {
      commands.push(component.spec);
    }
  }
  const fs = new FsSkillRegistry({ roots: [...roots] });
  const fsRegistry = withUserConfigContent(fs, userConfig);
  if (commands.length === 0) {
    return prefixSkillRegistry(fsRegistry, ir.identity.name);
  }
  const commandRegistry = buildCommandRegistry(commands, skillNames(fs), readSkillFile, userConfig);
  return prefixSkillRegistry(
    composeSkillRegistries([fsRegistry, commandRegistry]),
    ir.identity.name,
  );
}
function withUserConfigContent(
  registry: SkillRegistry,
  userConfig: UserConfigContentOptions | undefined,
): SkillRegistry {
  if (userConfig === undefined) {
    return registry;
  }
  return {
    list: () => registry.list(),
    load: async (id: string) => substituteSkillDocument(await registry.load(id), userConfig),
    loadFile: (id: string, relPath: string) => registry.loadFile(id, relPath),
    reload: () => registry.reload(),
  };
}
function substituteSkillDocument(value: unknown, uc: UserConfigContentOptions): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const source = value as Record<string, unknown>;
  if (typeof source.instructions !== 'string') {
    return value;
  }
  const doc: Record<string, unknown> = { ...source };
  doc.instructions = substituteUserConfigContent(source.instructions, uc);
  if (typeof source.description === 'string') {
    doc.description = substituteUserConfigContent(source.description, uc);
  }
  if (typeof source.whenToUse === 'string') {
    doc.whenToUse = substituteUserConfigContent(source.whenToUse, uc);
  }
  return doc;
}
function skillNames(registry: FsSkillRegistry): Set<string> {
  return new Set(registry.list().map((summary) => summary.name));
}
function buildCommandRegistry(
  commands: CommandSpec[],
  taken: ReadonlySet<string>,
  readSkillFile: SkillFileReader,
  userConfig: UserConfigContentOptions | undefined,
): SkillRegistry {
  const docs = new Map<string, SkillDocument>();
  for (const command of commands) {
    const doc = parseCommandDocument(command, readSkillFile, userConfig);
    if (doc === undefined || taken.has(doc.name) || docs.has(doc.name)) {
      continue;
    }
    docs.set(doc.name, doc);
  }
  return {
    list() {
      return [...docs.values()].map(commandSummaryOf);
    },
    load(id: string) {
      const doc = docs.get(id);
      if (doc === undefined) {
        throw new Error(`unknown skill: ${id}`);
      }
      return doc;
    },
    loadFile(id: string, relPath: string) {
      throw new Error(`unknown skill file: ${id}/${relPath}`);
    },
    reload() {},
  };
}
function parseCommandDocument(
  spec: CommandSpec,
  readSkillFile: SkillFileReader,
  userConfig: UserConfigContentOptions | undefined,
): SkillDocument | undefined {
  let content: string;
  try {
    content = readSkillFile(spec.file);
  } catch {
    return undefined;
  }
  let data: Record<string, unknown> = {};
  let body = content;
  try {
    const parsed = matter(content);
    body = parsed.content;
    if (typeof parsed.data === 'object' && parsed.data !== null && !Array.isArray(parsed.data)) {
      data = { ...parsed.data };
    }
  } catch {
    return undefined;
  }
  const substitute = (value: string): string =>
    userConfig ? substituteUserConfigContent(value, userConfig) : value;
  const description = typeof data.description === 'string' ? substitute(data.description) : '';
  const whenToUse = typeof data.when_to_use === 'string' ? substitute(data.when_to_use) : undefined;
  return {
    name: spec.name,
    description,
    instructions: substitute(body.trim()),
    ...(whenToUse !== undefined ? { whenToUse } : {}),
  };
}
function commandSummaryOf(doc: SkillDocument): SkillSummary {
  return {
    name: doc.name,
    description: doc.description,
    ...(doc.whenToUse !== undefined ? { whenToUse: doc.whenToUse } : {}),
  };
}
