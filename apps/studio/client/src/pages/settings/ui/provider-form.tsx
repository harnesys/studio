import type { Driver } from '@harnesys/studio-shared';
import { isDriver } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { catalogQuery } from '@/shared/api';

import type { DialogComponentProps } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import { DRIVER_ITEMS } from './driver-items';
import { ProviderEndpointFields, persistedApiUrl } from './provider-endpoint';

export function ProviderForm({
  onResolve,
}: DialogComponentProps<{ name: string; driver: Driver; apiUrl?: string }>) {
  const catalog = useQuery(catalogQuery).data;
  const [name, setName] = useState('');
  const [driver, setDriver] = useState<Driver>('openai');
  const [apiUrl, setApiUrl] = useState('');
  const selected = catalog?.drivers.find((item) => item.id === driver);

  return (
    <>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="new-provider-name">Name</FieldLabel>
          <Input
            id="new-provider-name"
            value={name}
            placeholder="xai"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-provider-driver">Driver</FieldLabel>
          <Select
            items={DRIVER_ITEMS}
            value={driver}
            onValueChange={(value) => {
              if (value && isDriver(value)) {
                setDriver(value);
                setApiUrl('');
              }
            }}
          >
            <SelectTrigger id="new-provider-driver" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {DRIVER_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <ProviderEndpointFields
          apiUrl={apiUrl}
          idPrefix="new-provider"
          endpoints={selected?.endpoints ?? []}
          defaultUrl={selected?.defaultUrl ?? ''}
          onApiUrlChange={setApiUrl}
        />
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={() => onResolve?.()}>
          Cancel
        </Button>
        <Button
          disabled={name.trim().length === 0}
          onClick={() => {
            const nextUrl = persistedApiUrl(
              selected?.endpoints ?? [],
              selected?.defaultUrl ?? '',
              apiUrl,
            );
            onResolve?.({
              name: name.trim(),
              driver,
              ...(nextUrl ? { apiUrl: nextUrl } : {}),
            });
          }}
        >
          Add provider
        </Button>
      </DialogFooter>
    </>
  );
}
