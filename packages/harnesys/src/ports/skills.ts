// biome-ignore-all lint/suspicious/noConfusingVoidType: SoT docs/17 SkillRegistry uses void|Promise<void> verbatim
import type { SkillSummary } from '../domain/skill.ts';

export type SkillRegistry = {
  list(): SkillSummary[] | Promise<SkillSummary[]>;
  load(id: string): unknown | Promise<unknown>;
  reload(): void | Promise<void>;
};
