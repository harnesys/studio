import { useEffect, useId, useRef, useState } from 'react';

import { studioMermaidConfig } from '@/shared/ui/mermaid-theme';
import { useTheme } from '@/shared/ui/theme-provider';

type MarkdownMermaidProps = {
  chart: string;
};

type MermaidApi = {
  initialize: (config: ReturnType<typeof studioMermaidConfig>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidModule: MermaidApi | null = null;
let mermaidLoading: Promise<MermaidApi> | null = null;
let initKey: string | null = null;
let renderChain: Promise<void> = Promise.resolve();

function getMermaid(): Promise<MermaidApi> {
  if (mermaidModule) {
    return Promise.resolve(mermaidModule);
  }
  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then((mod) => {
      mermaidModule = mod.default;
      return mermaidModule;
    });
  }
  return mermaidLoading;
}

function ensureInit(dark: boolean): Promise<MermaidApi> {
  const key = `${dark ? 'dark' : 'light'}:v7`;
  return getMermaid().then((mermaid) => {
    if (initKey !== key) {
      mermaid.initialize(studioMermaidConfig(dark));
      initKey = key;
    }
    return mermaid;
  });
}

function queueRender<T>(task: () => Promise<T>): Promise<T> {
  const run = renderChain.then(task, task);
  renderChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Drop author palette / init overrides so Studio tokens win. */
function sanitizeMermaidSource(source: string): string {
  return source
    .replace(/^---[\s\S]*?\n---\s*\n?/m, '')
    .replace(/^\s*%%\{[\s\S]*?\}%%\s*\n?/gm, '')
    .replace(/^\s*style\s+\S+.*$/gm, '')
    .replace(/^\s*classDef\s+\S+.*$/gm, '')
    .replace(/^\s*linkStyle\s+\S+.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function mindmapBranchTints(): string[] {
  return [
    cssVar('--chart-1', '#d4783a'),
    cssVar('--chart-2', '#8a9098'),
    cssVar('--chart-4', '#667078'),
    cssVar('--chart-5', '#c4622d'),
    cssVar('--live', '#d4783a'),
    cssVar('--muted-foreground', '#8a9098'),
  ];
}

function mindmapSectionIndex(node: Element): number | null {
  if (node.classList.contains('section-root') || node.classList.contains('section--1')) {
    return null;
  }
  for (const name of node.classList) {
    const match = /^section-(\d+)$/.exec(name);
    if (match) {
      return Number(match[1]);
    }
  }
  return 0;
}

function mix(tint: string, base: string, amount: number): string {
  return `color-mix(in oklab, ${tint} ${amount}%, ${base})`;
}

/** Mindmap paints via #svgId .section-* inside the SVG — restyle after insert. */
function paintMindmap(host: HTMLElement) {
  if (!host.querySelector('.mindmap-node, .node-bkg')) {
    return;
  }
  const muted = cssVar('--muted', '#eceeef');
  const card = cssVar('--card', '#fbfbfc');
  const border = cssVar('--border', '#e2e4e7');
  const foreground = cssVar('--foreground', '#16181d');
  const mutedFg = cssVar('--muted-foreground', '#667078');
  const live = cssVar('--live', '#d4783a');
  const tints = mindmapBranchTints();

  const paint = (el: Element, fill: string, stroke: string) => {
    if (!(el instanceof SVGElement)) {
      return;
    }
    el.style.setProperty('fill', fill, 'important');
    el.style.setProperty('stroke', stroke, 'important');
  };

  for (const node of host.querySelectorAll('.mindmap-node')) {
    const section = mindmapSectionIndex(node);
    const tint = section === null ? live : (tints[section % tints.length] ?? live);
    const fill = section === null ? mix(live, muted, 48) : mix(tint, card, 30);
    const stroke = section === null ? live : mix(tint, border, 50);

    for (const shape of node.querySelectorAll(
      ':is(rect, circle, path, polygon, ellipse, .node-bkg)',
    )) {
      if (shape.classList.contains('node-line-') || shape.tagName.toLowerCase() === 'line') {
        continue;
      }
      paint(shape, fill, stroke);
    }
    for (const text of node.querySelectorAll('text, tspan')) {
      if (text instanceof SVGElement) {
        text.style.setProperty('fill', foreground, 'important');
      }
    }
    for (const line of node.querySelectorAll('line, .node-line-')) {
      if (line instanceof SVGElement) {
        line.style.setProperty('stroke', stroke, 'important');
      }
    }
  }

  for (const edge of host.querySelectorAll('[class*="section-edge-"]')) {
    if (!(edge instanceof SVGElement)) {
      continue;
    }
    let tint = mutedFg;
    for (const name of edge.classList) {
      const match = /^section-edge-(\d+)$/.exec(name);
      if (match) {
        tint = tints[Number(match[1]) % tints.length] ?? mutedFg;
        break;
      }
    }
    edge.style.setProperty('stroke', mix(tint, mutedFg, 55), 'important');
    edge.style.setProperty('fill', 'none', 'important');
  }
}

export function MarkdownMermaid({ chart }: MarkdownMermaidProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replaceAll(':', '');
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const source = sanitizeMermaidSource(chart);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    void queueRender(async () => {
      const host = hostRef.current;
      if (!host || cancelled) {
        return;
      }
      host.replaceChildren();

      const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        if (!source) {
          throw new Error('empty mermaid source');
        }
        const dark = document.documentElement.classList.contains('dark');
        const mermaid = await ensureInit(dark);
        if (cancelled) {
          return;
        }
        const { svg } = await mermaid.render(id, source);
        document.getElementById(`d${id}`)?.remove();
        document.getElementById(id)?.remove();
        if (cancelled) {
          return;
        }
        host.innerHTML = svg;
        paintMindmap(host);
      } catch {
        document.getElementById(`d${id}`)?.remove();
        document.getElementById(id)?.remove();
        if (!cancelled) {
          setFailed(true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [source, reactId, theme]);

  if (failed) {
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
        <code className="font-mono text-[12px] text-muted-foreground leading-[1.45]">{chart}</code>
      </pre>
    );
  }

  return <div ref={hostRef} className="markdown-mermaid" />;
}
