import { zodResolver } from '@hookform/resolvers/zod';
import type { PinRecord } from '@studio/shared';
import { useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { FieldGroup } from '@/shared/ui/field';

import {
  emptyPinFields,
  type PinDraft,
  type PinFieldsInput,
  type PinFieldsOutput,
  pinFieldsFrom,
  pinFieldsSchema,
  toPinDraft,
} from '../model/pin-fields';
import { PinFields } from './pin-fields';

export function AddPinDialog({ onResolve }: DialogComponentProps<PinDraft>) {
  const form = useForm<PinFieldsInput, unknown, PinFieldsOutput>({
    resolver: zodResolver(pinFieldsSchema),
    defaultValues: emptyPinFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toPinDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <PinFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add pin</Button>
      </DialogFooter>
    </form>
  );
}

export function EditPinDialog({
  onResolve,
  data,
}: DialogComponentProps<PinDraft, { pin: PinRecord }>) {
  const form = useForm<PinFieldsInput, unknown, PinFieldsOutput>({
    resolver: zodResolver(pinFieldsSchema),
    defaultValues: data?.pin ? pinFieldsFrom(data.pin) : emptyPinFields(),
  });

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toPinDraft(values)))}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <PinFields control={form.control} keyLocked />
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
