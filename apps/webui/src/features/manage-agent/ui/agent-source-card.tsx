import type { ToolExposure } from 'harnesys';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Row, RowChip, RowItem, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Switch } from '@/shared/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

import type { SourceCardSection, SourceCardTool } from '../model/draft-overrides';

export type AgentSourceCardProps = {
  kind: 'pack' | 'plugin';
  name: string;
  description?: string;
  granted: boolean;
  /** Locked grant: switch on + disabled (`core` — host rule, server auto-provisions). */
  locked?: boolean;
  lockLabel?: string;
  onToggleGrant: (next: boolean) => void;
  /** Pack tools from the explain response with draft overrides merged in. */
  tools?: SourceCardTool[];
  /** Shown when the pack has no explain tool rows (ungranted / unsaved agent). */
  toolsHint?: string | null;
  onToggleTool?: (tool: string, disable: boolean) => void;
  onExposure?: (tool: string, exposure: ToolExposure) => void;
  /** Plugin explain sections (skills/mcp/hooks); plugins grant no tools. */
  sections?: SourceCardSection[];
  /** Shown when a granted plugin has no explain sections (unsaved agent has none yet). */
  sectionsEmptyHint?: string;
  /** Pack spec form (files/shell); rendered as a Settings section when open. */
  settings?: ReactNode;
};

export function AgentSourceCard({
  kind,
  name,
  description,
  granted,
  locked = false,
  lockLabel,
  onToggleGrant,
  tools = [],
  toolsHint,
  onToggleTool,
  onExposure,
  sections = [],
  sectionsEmptyHint,
  settings,
}: AgentSourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const grantChecked = locked ? true : granted;
  return (
    <Row
      testId={`draft-source-${name}`}
      title={name}
      meta={kind}
      muted={!grantChecked}
      chips={locked && lockLabel ? <RowChip tone="accent">{lockLabel}</RowChip> : null}
      summary={description}
      onToggle={() => setExpanded((current) => !current)}
      expanded={expanded}
      actions={
        <Switch
          size="sm"
          checked={grantChecked}
          disabled={locked}
          onCheckedChange={(next) => onToggleGrant(Boolean(next))}
          aria-label={`${kind} ${name}${locked && lockLabel ? ` (${lockLabel})` : ''}`}
        />
      }
      alwaysShowActions
    >
      {kind === 'pack' ? (
        <RowSection label="Tools" count={tools.length}>
          {tools.length === 0 ? (
            <p className="px-1 text-muted-foreground text-xs leading-snug">
              {toolsHint ?? 'No tools from this source in the saved effective set.'}
            </p>
          ) : (
            tools.map((tool) => (
              <SourceToolRow
                key={tool.name}
                tool={tool}
                editable={granted}
                onToggleTool={onToggleTool}
                onExposure={onExposure}
              />
            ))
          )}
        </RowSection>
      ) : null}
      {sections.map((section) => (
        <RowSection key={section.kind} label={section.label} count={section.items.length}>
          <RowList>
            {section.items.map((item) => (
              <RowItem
                key={item}
                title={item}
                testId={`draft-source-${name}-${section.kind}-${item}`}
              />
            ))}
          </RowList>
        </RowSection>
      ))}
      {kind === 'plugin' && sections.length === 0 ? (
        <RowSection label="Granted">
          <p className="px-1 text-muted-foreground text-xs leading-snug">
            {granted
              ? (sectionsEmptyHint ?? 'No skills, servers or hooks from this plugin.')
              : 'Off — nothing is granted from this plugin.'}
          </p>
        </RowSection>
      ) : null}
      {settings ? <RowSection label="Settings">{settings}</RowSection> : null}
    </Row>
  );
}

function SourceToolRow({
  tool,
  editable,
  onToggleTool,
  onExposure,
}: {
  tool: SourceCardTool;
  editable: boolean;
  onToggleTool?: (tool: string, disable: boolean) => void;
  onExposure?: (tool: string, exposure: ToolExposure) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-1 py-1"
      data-testid={`draft-source-tool-${tool.name}`}
    >
      <Switch
        size="sm"
        checked={!tool.disabled}
        disabled={!editable}
        onCheckedChange={(value) => onToggleTool?.(tool.name, !value)}
        aria-label={`Tool ${tool.name}`}
      />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <p
          className="min-w-0 truncate font-mono text-[12px] leading-snug"
          title={`${tool.provenance} · ${tool.status} — ${tool.reason}`}
        >
          {tool.name}
        </p>
        {tool.overridden ? <RowChip tone="accent">override</RowChip> : null}
        {onExposure ? (
          <ToggleGroup
            className="ml-auto shrink-0"
            variant="segment"
            value={[tool.exposure]}
            onValueChange={(value) => {
              const next = value[0];
              if (isExposure(next)) {
                onExposure(tool.name, next);
              }
            }}
          >
            <ToggleGroupItem value="direct" disabled={!editable || tool.disabled}>
              Direct
            </ToggleGroupItem>
            <ToggleGroupItem value="deferred" disabled={!editable || tool.disabled}>
              Deferred
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>
    </div>
  );
}

function isExposure(value: string): value is ToolExposure {
  return value === 'direct' || value === 'deferred';
}
