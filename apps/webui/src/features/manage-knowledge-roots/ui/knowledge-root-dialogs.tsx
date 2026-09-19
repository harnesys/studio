import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';
import {
  emptyKnowledgeRootFields,
  type KnowledgeRootDraft,
  type KnowledgeRootFieldsInput,
  type KnowledgeRootFieldsOutput,
  knowledgeRootFieldsSchema,
  toKnowledgeRootDraft,
} from '../model/knowledge-root-fields';
import { KnowledgeRootFields } from './knowledge-root-fields';
export function AddKnowledgeRootDialog({ onResolve }: DialogComponentProps<KnowledgeRootDraft>) {
  const form = useForm<KnowledgeRootFieldsInput, unknown, KnowledgeRootFieldsOutput>({
    resolver: zodResolver(knowledgeRootFieldsSchema),
    defaultValues: emptyKnowledgeRootFields(),
  });
  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toKnowledgeRootDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <KnowledgeRootFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add root</Button>
      </DialogFooter>
    </form>
  );
}
