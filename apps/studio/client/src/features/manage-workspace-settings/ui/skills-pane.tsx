import type { CreateWorkspaceSkillRequest } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PuzzleIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';

import { pluginStatusBadge, pluginStatusText } from '@/features/manage-agent';
import { openCreateSkillDialog } from '@/features/manage-workspace-skills';
import {
  createWorkspaceSkill,
  reloadWorkspaceSkills,
  workspaceSkillsQuery,
  workspaceSkillsQueryKey,
} from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList, RowSection } from '@/shared/ui/capability-rows';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { toast } from '@/shared/ui/toast';
export function SkillsPane({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId),
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
    <div className="flex flex-col gap-2" data-testid="skills-pane">
      <RowHeader label="Skills" count={skillsQuery.isPending ? undefined : skills.length}>
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
      </RowHeader>

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
          <RowList>
            {skills.map((skill) => {
              const { origin } = skill;
              const plugin = origin.kind === 'plugin';
              const statusChip =
                plugin && origin.status !== 'native' ? pluginStatusBadge(origin) : undefined;
              const hasDetail = Boolean(skill.description || skill.whenToUse);
              const expanded = expandedName === skill.name;
              return (
                <Row
                  key={skill.name}
                  testId={`skill-${skill.name}`}
                  title={plugin ? pluginSkillTitle(skill.name, origin.pluginName) : skill.name}
                  summary={
                    plugin && statusChip
                      ? pluginStatusText(origin)
                      : skill.description || skill.whenToUse
                  }
                  chips={
                    <>
                      {plugin ? (
                        <RowChip testId="skill-origin-chip">
                          <PuzzleIcon className="size-2.5" />
                          {origin.pluginName}
                        </RowChip>
                      ) : null}
                      {statusChip ? (
                        <RowChip tone={statusChip === 'invalid' ? 'danger' : 'accent'}>
                          {statusChip}
                        </RowChip>
                      ) : null}
                    </>
                  }
                  onToggle={
                    hasDetail
                      ? () =>
                          setExpandedName((current) => (current === skill.name ? null : skill.name))
                      : undefined
                  }
                  expanded={expanded && hasDetail}
                >
                  {skill.description ? (
                    <RowSection label="Description">
                      <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
                        {skill.description}
                      </p>
                    </RowSection>
                  ) : null}
                  {skill.whenToUse ? (
                    <RowSection label="When to use">
                      <p className="wrap-anywhere px-1 text-muted-foreground text-xs leading-4">
                        {skill.whenToUse}
                      </p>
                    </RowSection>
                  ) : null}
                </Row>
              );
            })}
          </RowList>
        ))}
    </div>
  );
}

function pluginSkillTitle(name: string, pluginName: string): string {
  const prefix = `${pluginName}:`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}
