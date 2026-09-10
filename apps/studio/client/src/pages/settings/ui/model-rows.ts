import type {
  DiscoveredModelView,
  IncompleteField,
  ProviderModelPublic,
} from '@harnesys/studio-shared';

import type { ModelFieldsDraft } from '@/features/manage-model';

export type ModelRow = {
  name: string;
  saved: boolean;
  stored?: ProviderModelPublic;
  found?: DiscoveredModelView;
};

const INCOMPLETE_FIELD_LABELS: Record<IncompleteField, string> = {
  context_length: 'Context',
  pricing: 'Input / output cost',
};

export function incompleteFieldLabel(field: IncompleteField): string {
  return INCOMPLETE_FIELD_LABELS[field];
}

export function getMissingFields(row: ModelRow): IncompleteField[] {
  if (row.found?.missing) {
    const meta = row.stored?.metadata as ModelFieldsDraft | undefined;
    const missing: IncompleteField[] = [];
    if (
      !meta?.context_length &&
      !meta?.top_provider?.context_length &&
      row.found.missing.includes('context_length')
    ) {
      missing.push('context_length');
    }
    if (!meta?.pricing && row.found.missing.includes('pricing')) {
      missing.push('pricing');
    }
    return missing;
  }
  return [];
}

export function modelRows(
  stored: ProviderModelPublic[],
  found: DiscoveredModelView[] | null,
): ModelRow[] {
  const storedByName = new Map(stored.map((item) => [item.name, item]));
  const rows: ModelRow[] = stored.map((item) => ({
    name: item.name,
    saved: true,
    stored: item,
    found: found?.find((entry) => entry.name === item.name),
  }));
  if (!found) {
    return rows;
  }
  for (const item of found) {
    if (!storedByName.has(item.name)) {
      rows.push({ name: item.name, saved: false, found: item });
    }
  }
  return rows;
}
