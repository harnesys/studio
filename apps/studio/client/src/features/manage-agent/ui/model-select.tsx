import { useQuery } from '@tanstack/react-query';
import { providersQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import { modelGroups, modelOptions } from '../model/model-groups';

type ModelSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  triggerClassName?: string;
  size?: 'sm' | 'default';
  workspaceId?: string;
};

export function ModelSelect({
  value,
  onChange,
  disabled,
  id,
  placeholder = 'Select model',
  triggerClassName,
  size = 'default',
  workspaceId: workspaceIdProp,
}: ModelSelectProps) {
  const focusWorkspaceId = studioFocusWorkspaceId(useStudioLocation());
  const workspaceId = workspaceIdProp ?? focusWorkspaceId ?? '';
  const providers = useQuery(providersQuery(workspaceId)).data ?? [];
  const groups = modelGroups(providers);
  const items = modelOptions(groups);
  const empty = items.length === 0;
  const selectedLabel = items.find((item) => item.value === value)?.name;

  return (
    <Select
      items={items.map((item) => ({ value: item.value, label: item.name }))}
      value={value || null}
      onValueChange={(next) => {
        if (typeof next === 'string') {
          onChange(next);
        }
      }}
      disabled={disabled || empty}
    >
      <SelectTrigger id={id} size={size} className={triggerClassName} data-testid="model-select">
        {selectedLabel ? (
          <span className="min-w-0 flex-1 truncate text-left font-mono">{selectedLabel}</span>
        ) : (
          <SelectValue placeholder={empty ? 'Attach a model first' : placeholder} />
        )}
      </SelectTrigger>
      <SelectContent className="w-full" align="start">
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.provider}</SelectLabel>
            {group.models.map((item) => (
              <SelectItem key={item.value} value={item.value} className="font-mono">
                {item.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
