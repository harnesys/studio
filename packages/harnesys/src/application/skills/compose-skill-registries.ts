import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';
import { resolveAllowedSkillName } from './skills-catalog.ts';

/** Compose registries left-to-right; later registries win on duplicate names.
 *  A bare `name` that misses everywhere resolves to a unique `*:name` member —
 *  same rule as allowlists (`resolveAllowedSkillName`). */
export function composeSkillRegistries(regs: SkillRegistry[]): SkillRegistry {
  return {
    async list() {
      const byName = new Map<string, SkillSummary>();
      for (const reg of regs) {
        for (const skill of await reg.list()) {
          byName.set(skill.name, skill);
        }
      }
      return [...byName.values()];
    },
    async load(id: string) {
      const owner = await findOwner(regs, id);
      if ('error' in owner) {
        throw new Error(owner.error);
      }
      return owner.reg.load(owner.id);
    },
    async loadFile(id: string, relPath: string) {
      const owner = await findOwner(regs, id);
      if ('error' in owner) {
        throw new Error(owner.error);
      }
      return owner.reg.loadFile(owner.id, relPath);
    },
    async reload() {
      for (const reg of regs) {
        await reg.reload();
      }
    },
  };
}

type SkillOwner = { reg: SkillRegistry; id: string } | { error: string };

async function findOwner(regs: SkillRegistry[], id: string): Promise<SkillOwner> {
  const members: { reg: SkillRegistry; names: Set<string> }[] = [];
  for (let i = regs.length - 1; i >= 0; i -= 1) {
    const reg = regs[i];
    if (reg === undefined) {
      continue;
    }
    const names = new Set((await reg.list()).map((skill) => skill.name));
    if (names.has(id)) {
      return { reg, id };
    }
    members.push({ reg, names });
  }
  const all = new Set<string>();
  for (const member of members) {
    for (const name of member.names) {
      all.add(name);
    }
  }
  const resolved = resolveAllowedSkillName(id, all);
  if (resolved !== undefined) {
    const owner = members.find((member) => member.names.has(resolved));
    if (owner !== undefined) {
      return { reg: owner.reg, id: resolved };
    }
  }
  const suffixed = [...all].filter((name) => name.endsWith(`:${id}`)).sort();
  if (suffixed.length > 1) {
    return { error: `ambiguous skill name: ${id} matches ${suffixed.join(', ')}` };
  }
  return { error: `unknown skill: ${id}` };
}
