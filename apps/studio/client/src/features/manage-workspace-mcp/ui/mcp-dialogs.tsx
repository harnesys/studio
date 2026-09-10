import { zodResolver } from '@hookform/resolvers/zod';
import type { WorkspaceMcpConfigServer } from '@harnesys/studio-shared';
import { useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  emptyMcpFields,
  type McpFieldsInput,
  type McpFieldsOutput,
  type McpServerDraft,
  mcpFieldsFrom,
  mcpFieldsSchema,
  toMcpServerDraft,
} from '../model/mcp-fields';
import { McpFields } from './mcp-fields';

export function AddMcpServerDialog({ onResolve }: DialogComponentProps<McpServerDraft>) {
  const form = useForm<McpFieldsInput, unknown, McpFieldsOutput>({
    resolver: zodResolver(mcpFieldsSchema),
    defaultValues: emptyMcpFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toMcpServerDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <McpFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add server</Button>
      </DialogFooter>
    </form>
  );
}

export function EditMcpServerDialog({
  onResolve,
  data,
}: DialogComponentProps<McpServerDraft, { server: WorkspaceMcpConfigServer }>) {
  const form = useForm<McpFieldsInput, unknown, McpFieldsOutput>({
    resolver: zodResolver(mcpFieldsSchema),
    defaultValues: data?.server ? mcpFieldsFrom(data.server) : emptyMcpFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toMcpServerDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <McpFields control={form.control} serverIdLocked />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
