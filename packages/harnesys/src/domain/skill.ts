export type SkillSummary = {
  name: string;
  description: string;
  whenToUse?: string;
};
export type SkillDocument = SkillSummary & {
  instructions: string;
  files?: string[];
};
export type SkillFile = {
  path: string;
  content: string;
};
