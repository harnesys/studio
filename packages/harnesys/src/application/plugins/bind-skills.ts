import { dirname } from 'node:path';
import matter from 'gray-matter';
import { FsSkillRegistry } from '../../adapters/fs-skill-registry.ts';
import type { CommandSpec, PluginIr } from '../../domain/plugin-ir.ts';
import type { SkillDocument, SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { composeSkillRegistries } from '../skills/compose-skill-registries.ts';
import { prefixSkillRegistry } from './prefixed-skill-registry.ts';

/** Reads one file from disk; injected so binding stays host-agnostic. */
export type SkillFileReader = (file: string) => string;

/**
 * IR → one prefixed `SkillRegistry` for a single plugin. `skills/<name>/SKILL.md`
 * roots scan through `FsSkillRegistry`; flat `commands/<name>.md` become skills
 * with frontmatter passthrough (name from frontmatter/stem, description and
 * body as-is, no strict SKILL.md validation). All names end up `plugin:skill`.
 */
export function bindSkillComponents(ir: PluginIr, readSkillFile: SkillFileReader): SkillRegistry {
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
  const fsRegistry = new FsSkillRegistry({ roots: [...roots] });
  if (commands.length === 0) {
    return prefixSkillRegistry(fsRegistry, ir.identity.name);
  }
  const commandRegistry = buildCommandRegistry(commands, skillNames(fsRegistry), readSkillFile);
  return prefixSkillRegistry(
    composeSkillRegistries([fsRegistry, commandRegistry]),
    ir.identity.name,
  );
}

function skillNames(registry: FsSkillRegistry): Set<string> {
  return new Set(registry.list().map((summary) => summary.name));
}

/** Command skills lose on a name clash with a real skill; first command wins. */
function buildCommandRegistry(
  commands: CommandSpec[],
  taken: ReadonlySet<string>,
  readSkillFile: SkillFileReader,
): SkillRegistry {
  const docs = new Map<string, SkillDocument>();
  for (const command of commands) {
    const doc = parseCommandDocument(command, readSkillFile);
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

/** Flat command md: frontmatter parsed tolerantly, body becomes instructions. */
function parseCommandDocument(
  spec: CommandSpec,
  readSkillFile: SkillFileReader,
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
  const description = typeof data.description === 'string' ? data.description : '';
  const whenToUse = typeof data.when_to_use === 'string' ? data.when_to_use : undefined;
  return {
    name: spec.name,
    description,
    instructions: body.trim(),
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
