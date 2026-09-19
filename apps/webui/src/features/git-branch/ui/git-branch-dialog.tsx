import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  type CreateBranchInput,
  type CreateBranchOutput,
  createBranchSchema,
  emptyBranch,
} from '../model/git-branch';
export function NewBranchDialog({
  onResolve,
  data,
}: DialogComponentProps<
  CreateBranchOutput,
  {
    from?: string;
  }
>) {
  const form = useForm<CreateBranchInput, unknown, CreateBranchOutput>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: emptyBranch(data?.from),
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(values))}
    >
      <FieldGroup>
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="git-branch-name">Branch name</FieldLabel>
              <Input
                {...field}
                id="git-branch-name"
                placeholder="feature/my-branch"
                autoFocus
                aria-invalid={fieldState.invalid || undefined}
              />
              {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
            </Field>
          )}
        />
        {data?.from ? (
          <Field>
            <FieldLabel>From</FieldLabel>
            <Input value={data.from} disabled className="font-mono text-xs" />
          </Field>
        ) : null}
        <Controller
          control={form.control}
          name="checkout"
          render={({ field }) => (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="git-branch-checkout"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
              <Label htmlFor="git-branch-checkout" className="font-normal text-sm">
                Checkout after create
              </Label>
            </div>
          )}
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Create</Button>
      </DialogFooter>
    </form>
  );
}
