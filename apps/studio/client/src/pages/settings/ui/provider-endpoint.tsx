import type { DriverEndpoint } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';

import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

const CUSTOM_ID = 'custom';

type ProviderEndpointFieldsProps = {
  apiUrl: string;
  idPrefix: string;
  endpoints: DriverEndpoint[];
  defaultUrl: string;
  onApiUrlChange: (apiUrl: string) => void;
};

export function ProviderEndpointFields({
  apiUrl,
  idPrefix,
  endpoints,
  defaultUrl,
  onApiUrlChange,
}: ProviderEndpointFieldsProps) {
  const presets = endpoints;
  const matched = matchEndpoint(presets, apiUrl);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    setCustom(false);
  }, []);

  const hasPresets = presets.length > 1;
  const selectedId = custom || (apiUrl.trim() && !matched) ? CUSTOM_ID : (matched?.id ?? CUSTOM_ID);
  const items = [
    ...presets.map((item) => ({
      value: item.id,
      label: item.group ? `${item.group} · ${item.label}` : item.label,
    })),
    { value: CUSTOM_ID, label: 'Custom' },
  ];
  const groups = [...new Set(presets.map((item) => item.group).filter((item) => item != null))];

  return (
    <>
      {hasPresets ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-endpoint`}>Endpoint</FieldLabel>
          <Select
            items={items}
            value={selectedId}
            onValueChange={(value) => {
              if (value === CUSTOM_ID) {
                setCustom(true);
                return;
              }
              setCustom(false);
              const found = presets.find((item) => item.id === value);
              if (found) {
                onApiUrlChange(found.apiUrl);
              }
            }}
          >
            <SelectTrigger id={`${idPrefix}-endpoint`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.length > 0
                ? groups.map((group) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {presets
                        .filter((item) => item.group === group)
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  ))
                : presets.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
              <SelectGroup>
                <SelectItem value={CUSTOM_ID}>Custom</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Coding Plan and API keys are not interchangeable. Use the region the key was issued in.
          </FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-base-url`}>Base URL</FieldLabel>
        <Input
          id={`${idPrefix}-base-url`}
          key={`${idPrefix}-url-${apiUrl}`}
          defaultValue={apiUrl}
          className="font-mono"
          placeholder={defaultUrl}
          onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== apiUrl) {
              onApiUrlChange(next);
            }
          }}
        />
      </Field>
    </>
  );
}

export function persistedApiUrl(
  endpoints: DriverEndpoint[],
  defaultUrl: string,
  apiUrl: string,
): string | undefined {
  const trimmed = apiUrl.trim();
  if (trimmed) {
    return trimmed;
  }
  if (endpoints.length > 1) {
    return defaultUrl || undefined;
  }
  return undefined;
}

function matchEndpoint(endpoints: DriverEndpoint[], apiUrl: string): DriverEndpoint | undefined {
  const needle = stripSlash(apiUrl.trim());
  if (!needle) {
    return endpoints[0];
  }
  return endpoints.find((item) => stripSlash(item.apiUrl) === needle);
}

function stripSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
