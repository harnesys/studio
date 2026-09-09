import { createLoadSkillTool } from '../application/skills/create-load-skill-tool.ts';
import { filterSkills, formatSkillsCatalog } from '../application/skills/skills-catalog.ts';

import { defineCapability } from '../domain/pack.ts';
import type { SkillRegistry } from '../ports/skills.ts';

export type SkillsCapabilityPorts = { skills: SkillRegistry };

export const skillsCapability = defineCapability<SkillsCapabilityPorts>({
  name: 'skills',
  version: '1.0.0',
  description: 'Skill catalog and load_skill',
  requires: ['skills'],
  configFrom: (def) => {
    const explicit = def.capabilities?.skills;
    if (explicit !== undefined) {
      return explicit;
    }
    const skills = def.skills;
    return skills && skills.length > 0 ? { spec: { allow: skills } } : {};
  },
  tools: (ctx) => [
    createLoadSkillTool(
      filterSkills(ctx.ports.skills, ctx.config.spec?.allow as string[] | undefined),
    ),
  ],
  notes: (ctx) => async () => {
    const catalog = formatSkillsCatalog(await ctx.ports.skills.list());
    return catalog ? [{ tag: 'skills', text: catalog }] : [];
  },
});
