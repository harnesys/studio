import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Agent } from '@/entities/agent';
import { updateAgentCapabilities } from '@/features/manage-agent';
import { workspaceSkillsQuery } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Switch } from '@/shared/ui/switch';

import { Section } from './section';

export function SkillsConfig({ agent }: { agent: Agent }) {
  const { workspaceId } = useStudioLocation();
  const query = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const catalog = query.data?.skills ?? [];
  const [saving, setSaving] = useState(false);

  async function toggle(name: string, enable: boolean) {
    if (!workspaceId || saving) {
      return;
    }
    const next = nextAllowlist(
      catalog.map((skill) => skill.name),
      agent.skills,
      name,
      enable,
    );
    setSaving(true);
    try {
      await updateAgentCapabilities(workspaceId, agent.id, { skills: next });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section label="Skills">
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No skills in `.agents/skills`.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {catalog.map((skill) => {
              const checked = agent.skills.length === 0 || agent.skills.includes(skill.name);
              return (
                <div key={skill.name} className="flex items-start gap-2">
                  <Switch
                    size="sm"
                    className="mt-0.5"
                    checked={checked}
                    disabled={saving}
                    onCheckedChange={(value) => {
                      void toggle(skill.name, Boolean(value));
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[12px] leading-snug">{skill.name}</p>
                    {skill.description ? (
                      <p className="truncate text-[11px] text-muted-foreground leading-snug">
                        {skill.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
    </Section>
  );
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
