import { zodResolver } from '@hookform/resolvers/zod';
import { SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';

import {
  type AddModelInput,
  type AddModelOutput,
  addModelSchema,
  emptyModelFields,
  type ModelFieldsDraft,
  type ModelFieldsInput,
  type ModelFieldsOutput,
  modelFieldsFrom,
  modelFieldsSchema,
  toModelDraft,
} from '../model/model-fields';
import { syncModelFromOpenRouter } from '../model/openrouter-sync';
import { ModelFields } from './model-fields';

export function EditModelDialog({
  onResolve,
  data,
}: DialogComponentProps<
  ModelFieldsDraft,
  { modelName?: string; confirm: string; initial?: ModelFieldsInput }
>) {
  const form = useForm<ModelFieldsInput, unknown, ModelFieldsOutput>({
    resolver: zodResolver(modelFieldsSchema),
    defaultValues: data?.initial ?? emptyModelFields(),
  });
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    const query = data?.modelName?.trim();
    if (!query) {
      toast.add({ title: 'Model name is not specified' });
      return;
    }
    setSyncing(true);
    try {
      const found = await syncModelFromOpenRouter(query);
      if (!found) {
        toast.add({
          title: 'Model not found in OpenRouter catalog',
          description: query,
        });
        return;
      }
      const syncedFields = modelFieldsFrom({ found });
      form.reset(syncedFields);
      toast.add({
        title: 'Metadata synced from OpenRouter',
        description: found.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.add({
        title: 'Failed to fetch OpenRouter catalog',
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) => onResolve?.(toModelDraft(values)))}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-muted-foreground text-xs">
          {data?.modelName || ''}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={handleSync}
          className="shrink-0 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
        >
          {syncing ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" />}
          Autofill from OpenRouter
        </Button>
      </div>
      <FieldGroup className="min-h-0 overflow-y-auto">
        <ModelFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">{data?.confirm ?? 'Save'}</Button>
      </DialogFooter>
    </form>
  );
}

export function AddModelDialog({
  onResolve,
}: DialogComponentProps<{ name: string } & ModelFieldsDraft>) {
  const form = useForm<AddModelInput, unknown, AddModelOutput>({
    resolver: zodResolver(addModelSchema),
    defaultValues: { name: '', ...emptyModelFields() },
  });
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    const query = form.getValues('name')?.trim();
    if (!query) {
      toast.add({ title: 'Please enter a model name first' });
      return;
    }
    setSyncing(true);
    try {
      const found = await syncModelFromOpenRouter(query);
      if (!found) {
        toast.add({
          title: 'Model not found in OpenRouter catalog',
          description: query,
        });
        return;
      }
      const syncedFields = modelFieldsFrom({ found });
      form.reset({
        name: query,
        ...syncedFields,
      });
      toast.add({
        title: 'Metadata synced from OpenRouter',
        description: found.name,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.add({
        title: 'Failed to fetch OpenRouter catalog',
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <form
      className="flex min-h-0 flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        onResolve?.({ name: values.name, ...toModelDraft(values) }),
      )}
    >
      <FieldGroup className="min-h-0 overflow-y-auto">
        <div className="flex items-end gap-2">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined} className="flex-1">
                <FieldLabel htmlFor="manual-model-name">Model</FieldLabel>
                <Input
                  {...field}
                  id="manual-model-name"
                  className="font-mono"
                  placeholder="grok-4"
                  aria-invalid={fieldState.invalid || undefined}
                />
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={syncing}
            onClick={handleSync}
            className="mb-0.5 shrink-0 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
          >
            {syncing ? <Spinner className="size-3.5" /> : <SparklesIcon className="size-3.5" />}
            Autofill
          </Button>
        </div>
        <ModelFields control={form.control} />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button type="submit">Add</Button>
      </DialogFooter>
    </form>
  );
}
