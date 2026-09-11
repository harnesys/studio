// biome-ignore-all lint/suspicious/noConfusingVoidType: SoT docs/17 SkillRegistry uses void|Promise<void> verbatim
import type { SkillFile, SkillSummary } from '../domain/skill.ts';

export type SkillRegistry = {
  list(): SkillSummary[] | Promise<SkillSummary[]>;
  load(id: string): unknown | Promise<unknown>;
  /** Read one supporting file from the skill directory; throws on unknown skill or file. */
  loadFile(id: string, relPath: string): SkillFile | Promise<SkillFile>;
  reload(): void | Promise<void>;
};
