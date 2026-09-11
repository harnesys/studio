import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

/** Compose registries left-to-right; later registries win on duplicate names. */
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
      for (let i = regs.length - 1; i >= 0; i -= 1) {
        const reg = regs[i];
        if (reg === undefined) {
          continue;
        }
        const names = new Set((await reg.list()).map((skill) => skill.name));
        if (names.has(id)) {
          return reg.load(id);
        }
      }
      throw new Error(`unknown skill: ${id}`);
    },
    async reload() {
      for (const reg of regs) {
        await reg.reload();
      }
    },
  };
}
