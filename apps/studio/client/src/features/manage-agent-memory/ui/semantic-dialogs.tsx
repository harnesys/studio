import { zodResolver } from '@hookform/resolvers/zod';
import type { MemoryRecord, SemanticScope } from '@studio/shared';
import { useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  emptySemanticFields,
  type SemanticDraft,
  type SemanticFieldsInput,
  type SemanticFieldsOutput,
  semanticFieldsFrom,
  semanticFieldsSchema,
  toSemanticDraft,
} from '../model/semantic-fields';
import { SemanticFields } from './semantic-fields';

export function AddSemanticDialog({
  onResolve,
  data,
}: DialogComponentProps<SemanticDraft, { scope?: SemanticScope }>) {
  const form = useForm<SemanticFieldsInput, unknown, SemanticFieldsOutput>({
    resolver: zodResolver(semanticFieldsSchema),
    defaultValues: emptySemanticFields(data?.scope ?? 'long'),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toSemanticDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <SemanticFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add memory</Button>
      </DialogFooter>
    </form>
  );
}

export function EditSemanticDialog({
  onResolve,
  data,
}: DialogComponentProps<SemanticDraft, { row: MemoryRecord }>) {
  const form = useForm<SemanticFieldsInput, unknown, SemanticFieldsOutput>({
    resolver: zodResolver(semanticFieldsSchema),
    defaultValues: data?.row ? semanticFieldsFrom(data.row) : emptySemanticFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        onResolve?.(
          toSemanticDraft(values, {
            id: data?.row.id,
            threadId: data?.row.threadId,
          }),
        ),
      )}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <SemanticFields control={form.control} scopeLocked />
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
