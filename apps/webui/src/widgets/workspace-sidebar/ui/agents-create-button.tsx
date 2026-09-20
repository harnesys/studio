import { PlusIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { runAgentCreateFlow } from '@/features/manage-agent';
import { Button } from '@/shared/ui/button';

export function AgentsSectionCreateButton({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New agent"
      aria-label="New agent"
      data-testid={`agents-create-${workspaceId}`}
      onClick={() => {
        void runAgentCreateFlow({ workspaceId, navigate, onCreated });
      }}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New agent</span>
    </Button>
  );
}
