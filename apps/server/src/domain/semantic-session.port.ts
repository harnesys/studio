export type SemanticSessionCleanup = {
  deleteSessionByThread(input: { workspaceId: string; threadId: string }): void;
};
