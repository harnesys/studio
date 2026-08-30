import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

export function filterSkills(registry: SkillRegistry, allowlist: string[] | undefined): SkillRegistry {
  if (!allowlist) return registry;
  const allowed = new Set(allowlist);
  return {
    list() { return Promise.resolve(registry.list()).then((list) => list.filter((s) => allowed.has(s))); },
    load(name: string) {
      if (!allowed.has(name)) throw new Error(`unknown skill: ${name}`);
      return registry.load(name);
    },
    reload() { return registry.reload(); },
  };
}

export function formatSkillsCatalog(skills: SkillSummary[]): string {
  if (skills.length === 0) return '';
  const lines = [
    '## Available skills',
    'Catalog (full text via load_skill):',
    ...skills.map((s) => s.whenToUse ? `- ${s.name}: ${s.description} (when: ${s.whenToUse})` : `- ${s.name}: ${s.description}`),
  ];
  return lines.join('\n');
}
