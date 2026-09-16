import hljs from 'highlight.js/lib/common';
import { memo } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import { cn } from '@/shared/lib/utils';
import { MarkdownMermaid } from '@/shared/ui/markdown-mermaid';

type MarkdownProps = {
  text: string;
  className?: string;
  streaming?: boolean;
};

const STREAM_REMARK = [remarkGfm];
const FULL_REMARK = [remarkGfm, remarkMath];

export const Markdown = memo(function Markdown({
  text,
  className,
  streaming = false,
}: MarkdownProps) {
  return (
    <div
      className={cn('markdown px-1.5 text-foreground leading-[1.45]', className)}
      data-streaming={streaming ? 'true' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={streaming ? STREAM_REMARK : FULL_REMARK}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={streaming ? STREAM_COMPONENTS : components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

const components: Components = {
  code({ className, children }) {
    const text = String(children).replace(/\n$/, '');
    const lang = /language-([a-z0-9_+-]+)/i.exec(className ?? '')?.[1];
    if (lang === 'mermaid') {
      return <MarkdownMermaid chart={text} />;
    }
    if (lang === undefined && !text.includes('\n')) {
      return (
        <code className="rounded-sm bg-muted px-1 py-px text-[12px] text-foreground">{text}</code>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
        <code
          className="hljs font-mono text-[12px] leading-[1.45]"
          // hljs output is escaped HTML for syntax coloring only.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escaped tokens
          dangerouslySetInnerHTML={{ __html: highlightCode(text, lang) }}
        />
      </pre>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

function streamCode({ className, children }: { className?: string; children?: React.ReactNode }) {
  const text = String(children).replace(/\n$/, '');
  if (!className && !text.includes('\n')) {
    return (
      <code className="rounded-sm bg-muted px-1 py-px text-[12px] text-foreground">{text}</code>
    );
  }
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 px-2.5 py-2">
      <code
        className="font-mono text-[12px] leading-[1.45]"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped plain text
        dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
      />
    </pre>
  );
}

const STREAM_COMPONENTS: Components = { code: streamCode, pre: components.pre };

function highlightCode(text: string, lang: string | undefined): string {
  if (lang !== undefined && hljs.getLanguage(lang) !== undefined) {
    return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  }
  const detected = hljs.highlightAuto(text);
  if (detected.language !== undefined && detected.value.length > 0) {
    return detected.value;
  }
  return escapeHtml(text);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
