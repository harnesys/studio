import { useQuery } from '@tanstack/react-query';

import { providersQuery } from '@/shared/api';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';

import {
  EMBED_NONE,
  embedModelGroups,
  findEmbedModelId,
  resolveEmbedSelection,
} from '../model/embed-model-groups';

type EmbedModelSelectProps = {
  embedProvider: string | null;
  embedModel: string | null;
  onChange: (next: { embedProvider: string | null; embedModel: string | null }) => void;
  disabled?: boolean;
  id?: string;
};

export function EmbedModelSelect({
  embedProvider,
  embedModel,
  onChange,
  disabled,
  id,
}: EmbedModelSelectProps) {
  const providers = useQuery(providersQuery).data ?? [];
  const groups = embedModelGroups(providers);
  const value = findEmbedModelId(providers, embedProvider, embedModel) ?? EMBED_NONE;
  const selected =
    value === EMBED_NONE
      ? null
      : groups.flatMap((group) => group.models).find((item) => item.value === value);

  return (
    <Select
      items={[
        { value: EMBED_NONE, label: 'None' },
        ...groups.flatMap((group) =>
          group.models.map((item) => ({ value: item.value, label: item.name })),
        ),
      ]}
      value={value}
      onValueChange={(next) => {
        if (typeof next !== 'string') {
          return;
        }
        onChange(resolveEmbedSelection(providers, next));
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} size="sm" data-testid="embed-model-select">
        {selected ? (
          <span className="min-w-0 flex-1 truncate text-left font-mono">{selected.name}</span>
        ) : (
          <SelectValue placeholder={groups.length === 0 ? 'No embed models' : 'None'} />
        )}
      </SelectTrigger>
      <SelectContent className="w-full" align="start">
        <SelectItem value={EMBED_NONE}>None</SelectItem>
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
