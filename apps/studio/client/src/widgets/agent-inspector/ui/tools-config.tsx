import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import { groupTools } from '@/entities/tool-catalog';
import { updateAgentCapabilities } from '@/features/manage-agent';
import { workspaceToolsQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Switch } from '@/shared/ui/switch';

import { Section } from './section';

export function ToolsConfig({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceToolsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const groups = groupTools(query.data?.tools ?? []).filter((group) => !(group.id === 'memory'));
  const catalogNames = groups.flatMap((group) => group.tools.map((tool) => tool.name));
  const [saving, setSaving] = useState(false);

  async function toggle(name: string, enable: boolean) {
    if (!workspaceId || saving) {
      return;
    }
    const next = nextAllowlist(catalogNames, agent.tools, name, enable);
    setSaving(true);
    try {
      await updateAgentCapabilities(workspaceId, agent.id, { tools: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section label="Tools">
      {!query.isPending &&
        (catalogNames.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No workspace tools.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </p>
                <div className="flex flex-col gap-2.5">
                  {group.tools.map((tool) => (
                    <ToolRow
                      key={tool.name}
                      name={tool.name}
                      description={tool.description}
                      checked={isChecked(agent.tools, tool.name)}
                      disabled={saving}
                      onToggle={(enable) => {
                        void toggle(tool.name, enable);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
    </Section>
  );
}

function ToolRow({
  name,
  description,
  checked,
  disabled,
  onToggle,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (enable: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Switch
        size="sm"
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onToggle(Boolean(value))}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium font-mono text-[12px] leading-snug">{name}</p>
        {description ? (
          <p className="truncate text-[11px] text-muted-foreground leading-snug">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function isChecked(allowlist: string[], name: string): boolean {
  return allowlist.length === 0 || allowlist.includes(name);
}

function nextAllowlist(
  catalogNames: string[],
  current: string[],
  name: string,
  enable: boolean,
): string[] {
  const enabled = new Set(current.length === 0 ? catalogNames : current);
  if (enable) {
    enabled.add(name);
  } else {
    enabled.delete(name);
  }
  const next = catalogNames.filter((item) => enabled.has(item));
  return next.length === catalogNames.length ? [] : next;
}
