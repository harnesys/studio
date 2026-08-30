import type { Driver, ProviderPublic, StudioCatalog } from '@studio/shared';
import { isDriver } from '@studio/shared';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
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
  showKey,
  onToggleKey,
  onUpdate,
}: {
  selected: ProviderPublic;
  catalog: StudioCatalog | undefined;
  showKey: boolean;
  onToggleKey: () => void;
  onUpdate: (patch: ProviderPatch) => void;
}) {
  return (
    <FieldGroup className="gap-4">
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
      <Field>
        <FieldLabel htmlFor="provider-key">API key</FieldLabel>
        <div className="relative">
          <Input
            id="provider-key"
            type={showKey ? 'text' : 'password'}
            defaultValue=""
            key={`${selected.id}-key-${selected.hasKey}`}
            placeholder={selected.hasKey ? 'Key is set' : 'Enter API key'}
            autoComplete="off"
            className="pr-9 font-mono"
            onBlur={(event) => {
              const apiKey = event.target.value.trim();
              if (!apiKey) {
                return;
              }
              onUpdate({ id: selected.id, apiKey });
              event.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
            onClick={onToggleKey}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </div>
      </Field>
    </FieldGroup>
  );
}
