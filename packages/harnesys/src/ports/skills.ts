import type { SkillFile, SkillSummary } from '../domain/skill.ts';
export type SkillRegistry = {
  list(): SkillSummary[] | Promise<SkillSummary[]>;
  load(id: string): unknown | Promise<unknown>;
  loadFile(id: string, relPath: string): SkillFile | Promise<SkillFile>;
  reload(): void | Promise<void>;
};
