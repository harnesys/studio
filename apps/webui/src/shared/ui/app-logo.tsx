import { useId } from 'react';
import { cn } from '@/shared/lib/utils';

const LETTER = 'M152 152h250v280h220V152h250v720H622V592H402v280H152Z';
export function AppLogo({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const body = `hg-body-${uid}`;
  const spec = `hg-spec-${uid}`;
  const glint = `hg-glint-${uid}`;
  const edge = `hg-edge-${uid}`;
  const clip = `hg-clip-${uid}`;
  return (
    <svg viewBox="0 0 1024 1024" fill="none" aria-hidden="true" className={cn('size-6', className)}>
      <defs>
        <linearGradient
          id={body}
          x1="512"
          y1="152"
          x2="512"
          y2="872"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2e3947" />
          <stop offset="0.45" stopColor="#161b22" />
          <stop offset="1" stopColor="#080b0f" />
        </linearGradient>
        <linearGradient
          id={spec}
          x1="512"
          y1="152"
          x2="512"
          y2="352"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ccd4dc" />
          <stop offset="1" stopColor="#93a5b4" />
        </linearGradient>
        <linearGradient
          id={glint}
          x1="512"
          y1="652"
          x2="512"
          y2="872"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#c7d3dd" />
          <stop offset="1" stopColor="#5d6b78" />
        </linearGradient>
        <linearGradient
          id={edge}
          x1="512"
          y1="152"
          x2="512"
          y2="872"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#d2d8de" stopOpacity="0.3" />
          <stop offset="1" stopColor="#d2d8de" stopOpacity="0.02" />
        </linearGradient>
        <clipPath id={clip}>
          <path d={LETTER} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path d={LETTER} fill={`url(#${body})`} />
        <polygon points="402,152 402,712 152,772" fill="#0a0d11" opacity="0.9" />
        <polygon points="152,152 402,152 152,352" fill={`url(#${spec})`} opacity="0.9" />
        <polygon points="402,152 362,152 402,252" fill="#b8c1ca" opacity="0.35" />
        <polygon points="152,872 372,872 152,652" fill={`url(#${glint})`} opacity="0.55" />
        <rect x="152" y="152" width="10" height="720" fill={`url(#${edge})`} />
        <polygon points="252,252 278,252 218,432 198,432" fill="#b7c0c9" opacity="0.22" />
        <polygon points="622,152 622,712 872,772" fill="#0a0d11" opacity="0.9" />
        <polygon points="872,152 622,152 872,352" fill={`url(#${spec})`} opacity="0.9" />
        <polygon points="622,152 662,152 622,252" fill="#b8c1ca" opacity="0.35" />
        <polygon points="872,872 652,872 872,652" fill={`url(#${glint})`} opacity="0.55" />
        <rect x="862" y="152" width="10" height="720" fill={`url(#${edge})`} />
        <polygon points="792,552 812,552 762,712 742,712" fill="#b7c0c9" opacity="0.15" />
        <polygon points="402,432 622,432 402,532" fill="#b5bec8" opacity="0.6" />
        <polygon points="402,592 622,592 522,702" fill="#090c10" opacity="0.9" />
        <polygon points="402,332 402,432 492,432" fill="#aeb8c2" opacity="0.4" />
        <polygon points="622,332 622,432 532,432" fill="#aeb8c2" opacity="0.25" />
      </g>
    </svg>
  );
}
