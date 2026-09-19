import type {
  PluginComponentSummary,
  PluginOptionValue,
  PluginSummary,
} from '@harnesys/studio-shared';

/** Server masks sensitive option values with this marker before they reach the client. */
export const MASKED_OPTION = '••••••••';

export type PluginOptionDraft = {
  key: string;
  sensitive: boolean;
  current: string;
  value: string;
};

const CONFIG_OPTION_KIND = 'config-option';

export function optionKeys(components: PluginComponentSummary[]): string[] {
  return components
    .filter((component) => component.kind === CONFIG_OPTION_KIND && component.status === 'native')
    .map((component) => component.source.pointer);
}

export function optionDrafts(plugin: PluginSummary): PluginOptionDraft[] {
  return optionKeys(plugin.components).map((key) => {
    const stored = plugin.options[key];
    const sensitive = stored === MASKED_OPTION;
    const current = stored === undefined ? '' : String(stored);
    return {
      key,
      sensitive,
      current,
      value: sensitive ? '' : current,
    };
  });
}

export function patchOptionDraft(
  drafts: PluginOptionDraft[],
  key: string,
  value: string,
): PluginOptionDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, value } : draft));
}

export function clearSensitiveDrafts(drafts: PluginOptionDraft[]): PluginOptionDraft[] {
  return drafts.map((draft) => (draft.sensitive ? { ...draft, value: '' } : draft));
}

/** Options the user actually changed; sensitive drafts only when a new value was typed. */
export function changedOptionValues(drafts: PluginOptionDraft[]): {
  key: string;
  value: PluginOptionValue;
}[] {
  const changed: { key: string; value: PluginOptionValue }[] = [];
  for (const draft of drafts) {
    if (draft.sensitive) {
      if (draft.value !== '') {
        changed.push({ key: draft.key, value: draft.value });
      }
      continue;
    }
    if (draft.value !== draft.current) {
      changed.push({ key: draft.key, value: coerceOptionValue(draft.current, draft.value) });
    }
  }
  return changed;
}

function coerceOptionValue(current: string, value: string): PluginOptionValue {
  if (current === 'true' && value === 'false') {
    return false;
  }
  if (current === 'false' && value === 'true') {
    return true;
  }
  if (current !== '' && current === String(Number(current)) && value === String(Number(value))) {
    return Number(value);
  }
  return value;
}
