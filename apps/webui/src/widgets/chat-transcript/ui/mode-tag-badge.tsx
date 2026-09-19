import { useQuery } from '@tanstack/react-query';
import { type LucideIcon, ZapIcon } from 'lucide-react';
import { workspaceSkillsQuery } from '@/shared/api';
import { studioFocusWorkspaceId, useStudioLocation } from '@/shared/config/location';
import { Badge } from '@/shared/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import type { DirectiveBadge } from '../model/directive-tag';
export function ModeTagBadges({
  badges,
  sidecarSkills,
}: {
  badges: DirectiveBadge[];
  sidecarSkills?: string[];
}) {
  const modeBadge = badges.find((badge) => badge.kind === 'mode');
  const skillsBadge = badges.find((badge) => badge.kind === 'skills');
  const parsedSkills = badges.flatMap((badge) => (badge.kind === 'skill' ? [badge.name] : []));
  const skillNames = parsedSkills.length > 0 ? parsedSkills : (sidecarSkills ?? []);
  const workspaceId = studioFocusWorkspaceId(useStudioLocation());
  const skillsQuery = useQuery({
    ...workspaceSkillsQuery(workspaceId ?? ''),
    enabled: skillNames.length > 0 && Boolean(workspaceId),
  });
  if (!modeBadge && !skillsBadge && skillNames.length === 0) {
    return null;
  }
  const catalog = skillsQuery.data?.skills ?? [];
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {modeBadge && modeBadge.kind === 'mode' ? (
        <BadgeTooltip
          label={`Mode: ${modeBadge.id}`}
          aria={`Mode ${modeBadge.id}`}
          title={modeBadge.name || modeBadge.id}
          body={modeBadge.body || 'No extra instructions in this mode.'}
        />
      ) : null}
      {skillNames.map((name) => (
        <SkillBadge
          key={name}
          name={name}
          description={catalog.find((skill) => skill.name === name)?.description}
        />
      ))}
    </span>
  );
}
function SkillBadge({ name, description }: { name: string; description?: string }) {
  if (!description) {
    return <SkillChip name={name} />;
  }
  return (
    <BadgeTooltip
      icon={ZapIcon}
      label={name}
      aria={`Skill ${name}`}
      title={name}
      body={description}
    />
  );
}
function SkillChip({ name }: { name: string }) {
  return (
    <Badge
      variant="secondary"
      className="h-4 gap-1 px-1.5 py-0 font-normal text-[10px]"
      aria-label={`Skill ${name}`}
    >
      <ZapIcon className="size-2.5" />
      {name}
    </Badge>
  );
}
function BadgeTooltip({
  icon: Icon,
  label,
  aria,
  title,
  body,
}: {
  icon?: LucideIcon;
  label: string;
  aria: string;
  title: string;
  body: string;
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <Badge
            variant="secondary"
            className="h-4 cursor-default gap-1 px-1.5 py-0 font-normal text-[10px]"
            aria-label={aria}
          >
            {Icon ? <Icon className="size-2.5" /> : null}
            {label}
          </Badge>
        }
      />
      <HoverCardContent
        side="bottom"
        align="end"
        className="max-h-80 w-96 overflow-y-auto p-3 text-[11px] leading-4"
      >
        <p className="mb-1.5 font-medium text-[12px]">{title}</p>
        <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{body}</pre>
      </HoverCardContent>
    </HoverCard>
  );
}
