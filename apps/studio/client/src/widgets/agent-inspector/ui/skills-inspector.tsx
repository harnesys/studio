import { useQuery } from '@tanstack/react-query';

import type { Agent } from '@/entities/agent';
import { workspaceSkillsQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';

import { Section } from './section';

export function SkillsInspector({ agent }: { agent: Agent }) {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const query = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const catalog = query.data?.skills ?? [];
  const names = catalog.map((skill) => skill.name).filter((name) => agent.skills.includes(name));
  let hint: string | undefined;
  if (!(query.isPending || catalog.length === 0)) {
    hint = String(names.length);
  }

  return (
    <Section label="Skills" hint={hint}>
      {!query.isPending &&
        (catalog.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No skills in `.harnesys/skills`.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {names.map((name) => (
              <p key={name} className="text-[12px] leading-snug">
                {name}
              </p>
            ))}
          </div>
        ))}
    </Section>
  );
}
