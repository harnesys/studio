export type BranchStateSeeder = {
  seedIfNeeded(threadId: string): Promise<void>;
};
