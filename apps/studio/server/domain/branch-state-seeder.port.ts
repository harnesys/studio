// biome-ignore lint/style/useConsistentTypeDefinitions: brief specifies interface for BranchStateSeeder
export interface BranchStateSeeder {
  /** Идемпотентно: пишет seed snapshot ветке без snapshot'ов. Вызывается перед claim/exec. */
  seedIfNeeded(threadId: string): Promise<void>;
}
