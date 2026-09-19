import { KnowledgeIndexPane } from '@/features/manage-knowledge-index';
export function MemoryPane({ workspaceId }: { workspaceId: string }) {
  return <KnowledgeIndexPane workspaceId={workspaceId} />;
}
