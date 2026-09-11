export type SkillSummary = {
  name: string;
  description: string;
  whenToUse?: string;
};

export type SkillDocument = SkillSummary & {
  instructions: string;
  /** Supporting files in the skill directory (relative paths, `SKILL.md` excluded). */
  files?: string[];
};

export type SkillFile = {
  /** Relative path inside the skill directory, as requested. */
  path: string;
  content: string;
};
