/** Host cleanup for semantic `session` rows tied to a thread. */
export type SemanticSessionCleanup = {
  deleteSessionByThread(input: { workspaceId: string; threadId: string }): void;
};
