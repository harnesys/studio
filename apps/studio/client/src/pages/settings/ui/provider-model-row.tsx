import { CircleCheckIcon, PencilIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';

import { confirmDetachModel, mergeFields, openEditModelDialog } from '@/features/manage-model';
import { Button } from '@/shared/ui/button';

import { getMissingFields, incompleteFieldLabel, type ModelRow } from './model-rows';
import { StatusIcon } from './model-status-icon';

export type ModelAttachInput = {
  providerId: string;
  name: string;
  kind?: string;
  metadata?: unknown;
};

export type ModelPatchInput = {
  providerId: string;
  modelId: string;
  metadata: unknown;
};

export type ModelDetachInput = {
  providerId: string;
  modelId: string;
};

export function ProviderModelRow({
  row,
  providerId,
  onAttach,
  onPatchModel,
  onDetach,
}: {
  row: ModelRow;
  providerId: string;
  onAttach: (input: ModelAttachInput) => void;
  onPatchModel: (input: ModelPatchInput) => void;
  onDetach: (input: ModelDetachInput) => void;
}) {
  const missing = getMissingFields(row);
  const incomplete = missing.length > 0;
  const verified = row.found ? row.found.verified : true;

  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-muted/50"
      data-testid={`model-${row.name}`}
      data-saved={row.saved ? 'true' : 'false'}
      data-incomplete={incomplete ? 'true' : 'false'}
      data-unverified={verified ? 'false' : 'true'}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{row.name}</span>
      {row.saved ? (
        <StatusIcon label="Saved">
          <CircleCheckIcon className="size-3.5 text-muted-foreground" />
        </StatusIcon>
      ) : null}
      {verified ? null : (
        <StatusIcon label="Not verified — may be unstable" testId={`model-unverified-${row.name}`}>
          <TriangleAlertIcon className="size-3.5 text-amber-500" />
        </StatusIcon>
      )}
      {incomplete ? (
        <StatusIcon
          label={`Incomplete: ${missing.map(incompleteFieldLabel).join(', ')}`}
          testId={`model-incomplete-${row.name}`}
          detail={
            <span className="flex flex-col items-start gap-0.5">
              <span>Incomplete</span>
              {missing.map((field) => (
                <span key={field} className="text-muted-foreground">
                  {incompleteFieldLabel(field)}
                </span>
              ))}
            </span>
          }
        >
          <TriangleAlertIcon className="size-3.5 text-destructive" />
        </StatusIcon>
      ) : null}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Edit ${row.name}`}
        onClick={() => {
          void openEditModelDialog(row).then((draft) => {
            if (!draft) {
              return;
            }
            if (row.saved && row.stored) {
              onPatchModel({
                providerId,
                modelId: row.stored.id,
                metadata: draft,
              });
              return;
            }
            onAttach({
              providerId,
              name: row.name,
              kind: row.found?.kind,
              metadata: mergeFields(row.found, draft),
            });
          });
        }}
      >
        <PencilIcon />
      </Button>
      {row.saved ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Detach ${row.name}`}
          data-testid={`detach-${row.name}`}
          onClick={() => {
            void confirmDetachModel(row.name).then((confirmed) => {
              if (confirmed && row.stored) {
                onDetach({
                  providerId,
                  modelId: row.stored.id,
                });
              }
            });
          }}
        >
          <Trash2Icon />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          data-testid={`attach-${row.name}`}
          onClick={() => {
            onAttach({
              providerId,
              name: row.name,
              kind: row.found?.kind,
              metadata: mergeFields(row.found),
            });
          }}
        >
          Attach
        </Button>
      )}
    </div>
  );
}
