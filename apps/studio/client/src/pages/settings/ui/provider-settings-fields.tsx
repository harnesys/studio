import type { Driver, ProviderPublic, StudioCatalog } from '@harnesys/studio-shared';
import { isDriver } from '@harnesys/studio-shared';
import { useState } from 'react';

import { Field, FieldLabel } from '@/shared/ui/field';
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
import { ProviderEndpointFields } from './provider-endpoint';

type ProviderPatch = {
  id: string;
  driver?: Driver;
  apiUrl?: string | null;
  apiKey?: string;
};

export function ProviderSettingsFields({
  selected,
  catalog,
  onUpdate,
}: {
  selected: ProviderPublic;
  catalog: StudioCatalog | undefined;
  onUpdate: (patch: ProviderPatch) => void;
}) {
  const [keySaved, setKeySaved] = useState(false);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="provider-driver">Driver</FieldLabel>
        <Select
          items={DRIVER_ITEMS}
          value={selected.driver}
          onValueChange={(value) => {
            if (value && isDriver(value)) {
              const presets = catalog?.drivers.find((item) => item.id === value)?.endpoints ?? [];
              onUpdate({
                id: selected.id,
                driver: value,
                apiUrl: presets.length > 1 ? (presets[0]?.apiUrl ?? null) : null,
              });
            }
          }}
        >
          <SelectTrigger id="provider-driver" className="w-full">
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
        apiUrl={selected.apiUrl ?? ''}
        idPrefix={`provider-${selected.id}`}
        endpoints={catalog?.drivers.find((item) => item.id === selected.driver)?.endpoints ?? []}
        defaultUrl={catalog?.drivers.find((item) => item.id === selected.driver)?.defaultUrl ?? ''}
        onApiUrlChange={(apiUrl) => {
          if (apiUrl === (selected.apiUrl ?? '')) {
            return;
          }
          onUpdate({ id: selected.id, apiUrl: apiUrl || null });
        }}
      />
      <Field className="sm:col-span-2">
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="provider-key">API key</FieldLabel>
          {keySaved ? (
            <span className="font-mono text-[10px] text-live uppercase tracking-wide">Saved</span>
          ) : null}
        </div>
        <Input
          id="provider-key"
          key={`${selected.id}-key-${selected.hasKey}`}
          type="password"
          defaultValue=""
          placeholder={selected.hasKey ? 'Replace stored key' : 'Enter API key'}
          autoComplete="off"
          className="font-mono"
          onFocus={() => setKeySaved(false)}
          onBlur={(event) => {
            const apiKey = event.target.value.trim();
            if (!apiKey) {
              return;
            }
            onUpdate({ id: selected.id, apiKey });
            event.target.value = '';
            setKeySaved(true);
          }}
        />
      </Field>
    </div>
  );
}
