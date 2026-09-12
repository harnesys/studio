import type { CreateWorkspaceSkillRequest } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';

import { ConfigEntityCard, initialsFromLabel } from '@/features/manage-agent';
import { openCreateSkillDialog } from '@/features/manage-workspace-skills';
import {
  createWorkspaceSkill,
  reloadWorkspaceSkills,
  workspaceSkillsQuery,
  workspaceSkillsQueryKey,
} from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';

export function SkillsPane() {
  const { workspaceId } = useStudioLocation();
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
  });
  const skills = skillsQuery.data?.skills ?? [];
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const reload = useMutation({
    mutationFn: () => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return reloadWorkspaceSkills(workspaceId);
    },
    onSuccess: (result) => {
      if (!workspaceId) {
        return;
      }
      queryClient.setQueryData(workspaceSkillsQueryKey(workspaceId), result);
      toast.add({ title: 'Skills reloaded' });
    },
  });

  const create = useMutation({
    mutationFn: (body: CreateWorkspaceSkillRequest) => {
      if (!workspaceId) {
        throw new Error('No workspace');
      }
      return createWorkspaceSkill(workspaceId, body);
    },
    onSuccess: async (result) => {
      if (!workspaceId) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: workspaceSkillsQueryKey(workspaceId) });
      toast.add({ title: 'Skill created', description: result.skill.name });
    },
  });

  return (
    <div className="flex flex-col gap-4" data-testid="skills-pane">
      <div className="flex h-8 items-center gap-1">
        <p className="font-medium text-sm">Catalog</p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!workspaceId || reload.isPending}
            onClick={() => reload.mutate()}
          >
            <RefreshCwIcon />
            Reload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={!workspaceId || create.isPending}
            onClick={() => {
              void openCreateSkillDialog().then((draft) => {
                if (!draft) {
                  return;
                }
                create.mutate(draft);
              });
            }}
          >
            <PlusIcon />
            New skill
          </Button>
        </div>
      </div>

      {skillsQuery.isPending && <p className="text-muted-foreground text-sm">Loading skills…</p>}
      {!skillsQuery.isPending &&
        (skills.length === 0 ? (
          <Empty className="min-h-0 border-0 py-8">
            <EmptyHeader>
              <EmptyTitle>No skills yet</EmptyTitle>
              <EmptyDescription>
                Add one or drop SKILL.md under `.harnesys/skills`.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1">
            {skills.map((skill) => {
              const expanded = expandedName === skill.name;
              return (
                <ConfigEntityCard
                  key={skill.name}
                  title={skill.name}
                  description={skill.description}
                  initials={initialsFromLabel(skill.name)}
                  monoTitle
                  expanded={Boolean(skill.whenToUse) && expanded}
                  onClick={
                    skill.whenToUse
                      ? () => setExpandedName(expanded ? null : skill.name)
                      : undefined
                  }
                >
                  {skill.whenToUse ? (
                    <div className="flex flex-col gap-0.5" data-testid={`skill-${skill.name}`}>
                      <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                        When to use
                      </p>
                      <p className="wrap-anywhere text-muted-foreground text-xs leading-4">
                        {skill.whenToUse}
                      </p>
                    </div>
                  ) : null}
                </ConfigEntityCard>
              );
            })}
          </div>
        ))}
    </div>
  );
}
