import { MAX_CHARS, MAX_ENTRIES } from '../../constants.ts';
import type { SkillSummary } from '../../domain/skill.ts';
import type { SkillRegistry } from '../../ports/skills.ts';

export function filterSkills(
  registry: SkillRegistry,
  allowlist: string[] | undefined,
): SkillRegistry {
  if (!allowlist) {
    return registry;
  }
  const allowed = new Set(allowlist);
  return {
    list() {
      return Promise.resolve(registry.list()).then((list) =>
        list.filter((s) => allowed.has(s.name)),
      );
    },
    load(name: string) {
      if (!allowed.has(name)) {
        throw new Error(`unknown skill: ${name}`);
      }
      return registry.load(name);
    },
    loadFile(name: string, relPath: string) {
      if (!allowed.has(name)) {
        throw new Error(`unknown skill: ${name}`);
      }
      return registry.loadFile(name, relPath);
    },
    reload() {
      return registry.reload();
    },
  };
}

export function formatSkillsCatalog(skills: SkillSummary[]): string {
  if (skills.length === 0) {
    return '';
  }
  const shown = skills.slice(0, MAX_ENTRIES);
  const lines = [
    '## Available skills',
    'Catalog (full text via load_skill):',
    ...shown.map((s) =>
      s.whenToUse
        ? `- ${s.name}: ${s.description} (when: ${s.whenToUse})`
        : `- ${s.name}: ${s.description}`,
    ),
  ];
  if (skills.length > shown.length) {
    lines.push(`+${skills.length - shown.length} more (raise the limit or trim skills)`);
  }
  let text = lines.join('\n');
  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS)}\n…(catalog truncated)`;
  }
  return text;
}
