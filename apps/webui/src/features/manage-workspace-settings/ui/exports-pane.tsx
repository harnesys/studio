import { Badge } from '@/shared/ui/badge';
import { FieldDescription, FieldGroup } from '@/shared/ui/field';
export function ExportsPane({ workspaceId }: { workspaceId: string }) {
  return (
    <FieldGroup className="gap-3" data-testid="exports-pane">
      <FieldDescription>
        Export and import bundles for this node are not wired yet. Node id: {workspaceId}.
      </FieldDescription>
      <Badge variant="secondary">Stub</Badge>
    </FieldGroup>
  );
}
