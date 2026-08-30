import { PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Agent } from '@/entities/agent';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { Button } from '@/shared/ui/button';
import { FieldGroup, FieldLegend, FieldSet } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import { type MemoryDraft, memoryDraftFrom, toAgentMemoryConfig } from '../model/agent-memory';
import { updateAgent } from '../model/update-agent';
import {
  EpisodicSection,
  KnowledgeSection,
  PinSection,
  SemanticSection,
} from './agent-memory-port-fields';

export function AgentMemoryFields({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const { openSettings } = useStudioNavigation();
  const [draft, setDraft] = useState(() => memoryDraftFrom(agent.memory));
  const [pathDraft, setPathDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const next = memoryDraftFrom(agent.memory);
    setDraft(next);
    draftRef.current = next;
  }, [agent.memory, agent.updatedAt]);

  function commit(next: MemoryDraft) {
    if (!workspaceId) {
      return;
    }
    const memory = toAgentMemoryConfig(next);
    if (JSON.stringify(memory) === JSON.stringify(agent.memory)) {
      return;
    }
    void updateAgent(workspaceId, agent.id, {
      name: agent.name,
      role: agent.role,
      instructions: agent.instructions,
      modelId: agent.modelId,
      effort: agent.effort,
      generation: agent.generation,
      toolOutput: agent.toolOutput,
      compaction: agent.compaction,
      memory,
    });
  }

  function patch(partial: Partial<MemoryDraft>, save = false) {
    setDraft((current) => {
      const next = { ...current, ...partial };
      draftRef.current = next;
      if (save) {
        commit(next);
      }
      return next;
    });
  }

  function addPath() {
    const path = pathDraft.trim();
    if (!path || draft.projectPaths.includes(path)) {
      return;
    }
    setPathDraft('');
    patch({ projectPaths: [...draft.projectPaths, path] }, true);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="agent-memory-fields">
      <PinSection
        draft={draft.pin}
        onChange={(pin, save) => patch({ pin }, save)}
        onCommit={() => commit(draftRef.current)}
      />
      <SemanticSection
        draft={draft.semantic}
        onChange={(semantic, save) => patch({ semantic }, save)}
        onCommit={() => commit(draftRef.current)}
      />
      <EpisodicSection
        draft={draft.episodic}
        onChange={(episodic, save) => patch({ episodic }, save)}
        onCommit={() => commit(draftRef.current)}
      />
      <KnowledgeSection
        draft={draft.knowledge}
        onChange={(knowledge, save) => patch({ knowledge }, save)}
        onCommit={() => commit(draftRef.current)}
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
                  patch({ projectPaths: draft.projectPaths.filter((item) => item !== path) }, true)
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
