import { type AgentMemoryConfig, defaultAgentMemory } from '@studio/shared';
import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { Agent } from '@/entities/agent';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import { FieldGroup, FieldLegend, FieldSet } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import { type MemoryDraft, memoryDraftFrom, toAgentMemoryConfig } from '../model/agent-memory';
import {
  EpisodicSection,
  KnowledgeSection,
  PinSection,
  SemanticSection,
} from './agent-memory-port-fields';

export function DraftMemory({
  agent,
  onChange,
}: {
  agent: Agent | null;
  onChange: (memory: AgentMemoryConfig) => void;
}) {
  const { openSettings } = useStudioNavigation();
  const [draft, setDraft] = useState(() => memoryDraftFrom(agent?.memory ?? defaultAgentMemory()));
  const [pathDraft, setPathDraft] = useState('');

  function patch(partial: Partial<MemoryDraft>) {
    const next = { ...draft, ...partial };
    setDraft(next);
    onChange(toAgentMemoryConfig(next));
  }

  function addPath() {
    const path = pathDraft.trim();
    if (!path || draft.projectPaths.includes(path)) {
      return;
    }
    setPathDraft('');
    patch({ projectPaths: [...draft.projectPaths, path] });
  }

  return (
    <div className="flex flex-col gap-3">
      <PinSection draft={draft.pin} onChange={(pin) => patch({ pin })} onCommit={() => undefined} />
      <SemanticSection
        draft={draft.semantic}
        onChange={(semantic) => patch({ semantic })}
        onCommit={() => undefined}
      />
      <EpisodicSection
        draft={draft.episodic}
        onChange={(episodic) => patch({ episodic })}
        onCommit={() => undefined}
      />
      <KnowledgeSection
        draft={draft.knowledge}
        onChange={(knowledge) => patch({ knowledge })}
        onCommit={() => undefined}
        onOpenRoots={() => openSettings('memory')}
      />
      <FieldSet className="gap-2">
        <FieldLegend className="font-medium text-muted-foreground text-xs">
          Project paths
        </FieldLegend>
        <FieldGroup className="gap-2">
          {draft.projectPaths.map((path) => (
            <div key={path} className="flex items-center gap-1.5">
              <Input className="font-mono text-xs" value={path} readOnly />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${path}`}
                onClick={() =>
                  patch({ projectPaths: draft.projectPaths.filter((item) => item !== path) })
                }
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              className="font-mono text-xs"
              placeholder="AGENTS.md"
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addPath();
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Add path"
              onClick={addPath}
            >
              <PlusIcon className="size-3.5" />
            </Button>
          </div>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
