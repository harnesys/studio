// biome-ignore-all lint/suspicious/noConfusingVoidType: SoT docs/17 SkillRegistry uses void|Promise<void> verbatim
export type SkillRegistry = {
  list(): string[] | Promise<string[]>;
  load(id: string): unknown | Promise<unknown>;
  reload(): void | Promise<void>;
};
