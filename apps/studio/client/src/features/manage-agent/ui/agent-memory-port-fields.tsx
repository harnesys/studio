import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/switch';

import {
  type EpisodicDraft,
  KNOWLEDGE_IMPLS,
  type KnowledgeDraft,
  type KnowledgeImpl,
  MEMORY_OFF,
  PIN_IMPLS,
  type PinDraft,
  type PinImpl,
  SEARCH_IMPLS,
  SEMANTIC_IMPLS,
  SEMANTIC_SCOPES,
  SESSION_TTLS,
  type SearchImpl,
  type SemanticDraft,
  type SemanticImpl,
  type SessionTtlOption,
} from '../model/agent-memory';
import { ImplSelect, PortSection, SpecNumber } from './agent-memory-controls';

export function PinSection({
  draft,
  onChange,
  onCommit,
}: {
  draft: PinDraft;
  onChange: (next: PinDraft, save?: boolean) => void;
  onCommit: () => void;
}) {
  return (
    <PortSection title="Pin">
      <ImplSelect
        id="memory-pin-impl"
        value={draft.impl}
        items={PIN_IMPLS.map((value) => ({ value, label: value === MEMORY_OFF ? 'Off' : value }))}
        onChange={(impl) => onChange({ ...draft, impl: impl as PinImpl }, true)}
      />
      {draft.impl !== MEMORY_OFF ? (
        <div className="grid grid-cols-2 gap-2">
          <SpecNumber
            id="memory-pin-budget"
            label="Budget tokens"
            value={draft.budgetTokens}
            onChange={(budgetTokens) => onChange({ ...draft, budgetTokens })}
            onCommit={onCommit}
          />
          <SpecNumber
            id="memory-pin-max"
            label="Max items"
            value={draft.maxItems}
            onChange={(maxItems) => onChange({ ...draft, maxItems })}
            onCommit={onCommit}
          />
        </div>
      ) : null}
    </PortSection>
  );
}

export function SemanticSection({
  draft,
  onChange,
  onCommit,
}: {
  draft: SemanticDraft;
  onChange: (next: SemanticDraft, save?: boolean) => void;
  onCommit: () => void;
}) {
  return (
    <PortSection title="Semantic">
      <ImplSelect
        id="memory-semantic-impl"
        value={draft.impl}
        items={SEMANTIC_IMPLS.map((value) => ({
          value,
          label: value === MEMORY_OFF ? 'Off' : value,
        }))}
        onChange={(impl) => onChange({ ...draft, impl: impl as SemanticImpl }, true)}
      />
      {draft.impl !== MEMORY_OFF ? (
        <>
          <Field>
            <FieldLabel>Auto project</FieldLabel>
            <div className="flex gap-3">
              {SEMANTIC_SCOPES.map((scope) => {
                const id = `memory-semantic-scope-${scope}`;
                const checked = draft.autoProject.includes(scope);
                return (
                  <div key={scope} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) => {
                        const autoProject = value
                          ? [...draft.autoProject, scope]
                          : draft.autoProject.filter((item) => item !== scope);
                        onChange({ ...draft, autoProject }, true);
                      }}
                    />
                    <FieldLabel htmlFor={id} className="font-normal">
                      {scope}
                    </FieldLabel>
                  </div>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <SpecNumber
              id="memory-semantic-limit"
              label="Project limit"
              value={draft.projectLimit}
              onChange={(projectLimit) => onChange({ ...draft, projectLimit })}
              onCommit={onCommit}
            />
            <SpecNumber
              id="memory-semantic-budget"
              label="Budget tokens"
              value={draft.projectBudgetTokens}
              onChange={(projectBudgetTokens) => onChange({ ...draft, projectBudgetTokens })}
              onCommit={onCommit}
            />
          </div>
          <ImplSelect
            id="memory-semantic-ttl"
            label="Session TTL"
            value={draft.sessionTtl}
            items={SESSION_TTLS.map((value) => ({ value, label: value }))}
            onChange={(sessionTtl) =>
              onChange({ ...draft, sessionTtl: sessionTtl as SessionTtlOption }, true)
            }
          />
        </>
      ) : null}
    </PortSection>
  );
}

export function EpisodicSection({
  draft,
  onChange,
  onCommit,
}: {
  draft: EpisodicDraft;
  onChange: (next: EpisodicDraft, save?: boolean) => void;
  onCommit: () => void;
}) {
  return (
    <PortSection title="Episodic">
      <ImplSelect
        id="memory-episodic-impl"
        value={draft.impl}
        items={SEARCH_IMPLS.map((value) => ({
          value,
          label: value === MEMORY_OFF ? 'Off' : value,
        }))}
        onChange={(impl) => onChange({ ...draft, impl: impl as SearchImpl }, true)}
      />
      {draft.impl !== MEMORY_OFF ? (
        <div className="grid grid-cols-2 gap-2">
          <SpecNumber
            id="memory-episodic-topk"
            label="Top K"
            value={draft.topK}
            onChange={(topK) => onChange({ ...draft, topK })}
            onCommit={onCommit}
          />
          <Field orientation="horizontal" className="items-center gap-2 pt-5">
            <FieldLabel htmlFor="memory-episodic-index" className="font-normal text-xs">
              Index on compact
            </FieldLabel>
            <Switch
              id="memory-episodic-index"
              size="sm"
              checked={draft.indexOnCompact}
              onCheckedChange={(value) =>
                onChange({ ...draft, indexOnCompact: Boolean(value) }, true)
              }
            />
          </Field>
        </div>
      ) : null}
    </PortSection>
  );
}

export function KnowledgeSection({
  draft,
  onChange,
  onCommit,
  onOpenRoots,
}: {
  draft: KnowledgeDraft;
  onChange: (next: KnowledgeDraft, save?: boolean) => void;
  onCommit: () => void;
  onOpenRoots: () => void;
}) {
  return (
    <PortSection title="Knowledge">
      <ImplSelect
        id="memory-knowledge-impl"
        value={draft.impl}
        items={KNOWLEDGE_IMPLS.map((value) => ({
          value,
          label: value === MEMORY_OFF ? 'Off' : 'On',
        }))}
        onChange={(impl) => onChange({ ...draft, impl: impl as KnowledgeImpl }, true)}
      />
      {draft.impl !== MEMORY_OFF ? (
        <>
          <SpecNumber
            id="memory-knowledge-topk"
            label="Top K"
            value={draft.topK}
            onChange={(topK) => onChange({ ...draft, topK })}
            onCommit={onCommit}
          />
          <p className="text-[11px] text-muted-foreground leading-snug">
            Index settings live in{' '}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={onOpenRoots}
            >
              Settings → Memory
            </button>
            .
          </p>
        </>
      ) : null}
    </PortSection>
  );
}
