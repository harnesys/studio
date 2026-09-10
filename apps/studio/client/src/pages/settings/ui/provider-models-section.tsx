import type { DiscoveredModelView, ProviderPublic } from '@harnesys/studio-shared';
import { PlusIcon, RefreshCwIcon, SearchIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { openAddModelDialog } from '@/features/manage-model';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { modelRows } from './model-rows';
import {
  type ModelAttachInput,
  type ModelDetachInput,
  type ModelPatchInput,
  ProviderModelRow,
} from './provider-model-row';

export function ProviderModelsSection({
  selected,
  found,
  discovering,
  onDiscover,
  onAttach,
  onPatchModel,
  onDetach,
}: {
  selected: ProviderPublic;
  found: DiscoveredModelView[] | null;
  discovering: boolean;
  onDiscover: () => void;
  onAttach: (input: ModelAttachInput) => void;
  onPatchModel: (input: ModelPatchInput) => void;
  onDetach: (input: ModelDetachInput) => void;
}) {
  const [modelSearch, setModelSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rows = modelRows(selected.models, found);
  const filteredRows = modelSearch.trim()
    ? rows.filter((row) => row.name.toLowerCase().includes(modelSearch.toLowerCase()))
    : rows;

  return (
    <div className="mt-8">
      <div className="flex h-8 items-center gap-2">
        <p className="font-medium text-sm">Models</p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setSearchOpen((open) => {
                if (open) {
                  setModelSearch('');
                } else {
                  setTimeout(() => searchRef.current?.focus(), 0);
                }
                return !open;
              });
            }}
          >
            <SearchIcon />
            Search
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="discover-models"
            disabled={discovering}
            onClick={onDiscover}
          >
            <RefreshCwIcon />
            Discover
          </Button>
        </div>
      </div>
      {searchOpen ? (
        <div className="relative mt-2 mb-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Search models…"
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
            className="h-8 pr-8 pl-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                setModelSearch('');
              }
            }}
          />
          {modelSearch ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
              onClick={() => setModelSearch('')}
              aria-label="Clear search"
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Discover to list what the provider returns, then attach the ones you want.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {filteredRows.map((row) => (
            <ProviderModelRow
              key={row.stored?.id ?? `found:${row.name}`}
              row={row}
              providerId={selected.id}
              onAttach={onAttach}
              onPatchModel={onPatchModel}
              onDetach={onDetach}
            />
          ))}
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 text-muted-foreground"
        onClick={() => {
          void openAddModelDialog().then((draft) => {
            if (!draft) {
              return;
            }
            const { name, ...fields } = draft;
            onAttach({
              providerId: selected.id,
              name,
              metadata: fields,
            });
          });
        }}
      >
        <PlusIcon />
        Add model
      </Button>
    </div>
  );
}
