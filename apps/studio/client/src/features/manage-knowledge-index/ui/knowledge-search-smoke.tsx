import type { KnowledgeHit } from '@studio/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiError, searchKnowledge } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

type KnowledgeSearchSmokeProps = {
  workspaceId: string | undefined;
};

export function KnowledgeSearchSmoke({ workspaceId }: KnowledgeSearchSmokeProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeHit[]>([]);

  const search = useMutation({
    mutationFn: (query: string) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return searchKnowledge(workspaceId, { query, limit: 8 });
    },
    onSuccess: (next) => {
      setHits(next);
    },
    onError: (error) => {
      toast.add({
        title: 'Search failed',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });

  return (
    <Field className="gap-2">
      <FieldLabel htmlFor="knowledge-search">Search smoke</FieldLabel>
      <div className="flex gap-2">
        <Input
          id="knowledge-search"
          value={searchQuery}
          placeholder="Query indexed chunks"
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && searchQuery.trim()) {
              search.mutate(searchQuery.trim());
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!workspaceId || !searchQuery.trim() || search.isPending}
          onClick={() => search.mutate(searchQuery.trim())}
        >
          Search
        </Button>
      </div>
      <FieldDescription>Optional debug hits for this workspace.</FieldDescription>
      {hits.length > 0 ? (
        <div className="flex flex-col gap-2 pt-1">
          {hits.map((hit) => (
            <div key={hit.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{hit.title ?? hit.uri ?? hit.id}</div>
              <p className="line-clamp-3 text-muted-foreground text-xs">{hit.text}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Field>
  );
}
