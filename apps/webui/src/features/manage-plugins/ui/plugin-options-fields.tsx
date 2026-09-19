import { Input } from '@/shared/ui/input';

import type { PluginOptionDraft } from '../model/plugin-options';

export function PluginOptionsFields({
  drafts,
  onChange,
}: {
  drafts: PluginOptionDraft[];
  onChange: (key: string, value: string) => void;
}) {
  if (drafts.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="plugin-options-fields">
      {drafts.map((draft) => {
        const inputId = `plugin-option-${draft.key}`;
        return (
          <div key={draft.key} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="font-mono text-xs">
              {draft.key}
            </label>
            <Input
              id={inputId}
              className="font-mono"
              type={draft.sensitive ? 'password' : 'text'}
              autoComplete="off"
              value={draft.value}
              placeholder={
                draft.sensitive && draft.current !== '' ? 'Saved value hidden' : 'Not set'
              }
              onChange={(event) => onChange(draft.key, event.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
