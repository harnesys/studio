import { Badge } from '@/shared/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';

import type { ModeTagBadge } from '../model/mode-tag';

export function ModeTagBadges({ badges }: { badges: ModeTagBadge[] }) {
  const modeBadge = badges.find((badge) => badge.kind === 'mode');
  const skillsBadge = badges.find((badge) => badge.kind === 'skills');
  if (!modeBadge && !skillsBadge) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {modeBadge && modeBadge.kind === 'mode' ? (
        <BadgeTooltip
          label={`Mode: ${modeBadge.id}`}
          aria={`Mode ${modeBadge.id}`}
          title={modeBadge.name || modeBadge.id}
          body={modeBadge.body || 'No extra instructions in this mode.'}
        />
      ) : null}
      {skillsBadge && skillsBadge.kind === 'skills' ? (
        <BadgeTooltip
          label="Mode Skills"
          aria="Mode skills"
          title="Mode skills"
          body={skillsBadge.body}
        />
      ) : null}
    </span>
  );
}

function BadgeTooltip({
  label,
  aria,
  title,
  body,
}: {
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
            className="h-4 cursor-default px-1.5 py-0 font-normal text-[10px]"
            aria-label={aria}
          >
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
