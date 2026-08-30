import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateWorkspaceSkillRequest } from '@studio/shared';
import { useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  emptySkillFields,
  type SkillFieldsInput,
  type SkillFieldsOutput,
  skillFieldsSchema,
  toCreateSkillRequest,
} from '../model/skill-fields';
import { SkillFields } from './skill-fields';

export function CreateSkillDialog({
  onResolve,
}: DialogComponentProps<CreateWorkspaceSkillRequest>) {
  const form = useForm<SkillFieldsInput, unknown, SkillFieldsOutput>({
    resolver: zodResolver(skillFieldsSchema),
    defaultValues: emptySkillFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toCreateSkillRequest(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <SkillFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Create skill</Button>
      </DialogFooter>
    </form>
  );
}
