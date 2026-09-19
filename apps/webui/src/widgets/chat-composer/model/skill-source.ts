import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSelectedAgent } from '@/features/desk';
import { workspaceSkillsQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { isValidEntityRef } from './entity-kinds';

export type SkillOption = { name: string; description: string };

export type ComposerSkillOptions = { options: SkillOption[]; loading: boolean };

// Closed world: a skill is offered only if the agent allowlist names it, its origin
// can actually load (`workspace` or native `plugin`), and its ref fits the chip and the wire.
export function useComposerSkillOptions(): ComposerSkillOptions {
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const agent = useSelectedAgent();
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const allowlist = useMemo(() => new Set(agent?.skills ?? []), [agent?.skills]);
  const options = useMemo<SkillOption[]>(() => {
    const catalog = skillsQuery.data?.skills ?? [];
    return catalog
      .filter(
        (skill) =>
          allowlist.has(skill.name) &&
          (skill.origin.kind === 'workspace' ||
            (skill.origin.kind === 'plugin' && skill.origin.status === 'native')) &&
          isValidEntityRef('skill', skill.name),
      )
      .map((skill) => ({ name: skill.name, description: skill.description }));
  }, [skillsQuery.data, allowlist]);
  return { options, loading: skillsQuery.isPending };
}
