import { CheckIcon, CopyIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LspBridgeStatus } from '@/features/lsp-bridge';
import { cn } from '@/shared/lib/utils';

export type EditorCursor = { line: number; column: number };

const LSP_DOT: Record<LspBridgeStatus, string> = {
  live: 'bg-emerald-500',
  starting: 'bg-amber-500',
  error: 'bg-red-500',
  off: 'bg-muted-foreground/50',
};

const LSP_LABEL: Record<LspBridgeStatus, string> = {
  live: 'LSP',
  starting: 'LSP…',
  error: 'LSP error',
  off: 'LSP off',
};

export function EditorStatusBar({
  path,
  language,
  lspStatus,
  dirty,
  cursor,
  content,
}: {
  path: string;
  language: string;
  lspStatus: LspBridgeStatus;
  dirty: boolean;
  cursor: EditorCursor;
  content: string;
}) {
  const [copied, setCopied] = useState(false);
  const size = useMemo(() => formatBytes(new TextEncoder().encode(content).length), [content]);
  const eol = useMemo(() => (content.includes('\r\n') ? 'CRLF' : 'LF'), [content]);
  const indent = useMemo(() => detectIndent(content), [content]);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable; the full path stays visible in the tooltip
    }
  };

  return (
    <footer
      className="flex h-6 shrink-0 select-none items-center gap-1 border-border/60 border-t bg-muted/30 px-2 text-[11px] text-muted-foreground"
      data-testid="editor-status-bar"
    >
      <span
        title={`Language server: ${lspStatus}`}
        className="flex shrink-0 items-center gap-1.5 px-1"
      >
        <span className={cn('size-1.5 rounded-full', LSP_DOT[lspStatus])} />
        {LSP_LABEL[lspStatus]}
      </span>
      {dirty ? (
        <span title="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-live" />
      ) : null}
      <button
        type="button"
        onClick={copyPath}
        title={`${path} — click to copy`}
        className="group/path flex min-w-0 items-center gap-1 truncate px-1 hover:text-foreground"
      >
        <span className="truncate">{path}</span>
        {copied ? (
          <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3 shrink-0 opacity-0 group-hover/path:opacity-70" />
        )}
      </button>
      <span title="Detected language" className="shrink-0 px-1">
        {language}
      </span>
      <span className="ml-auto flex shrink-0 items-center">
        <span title="Cursor position" className="px-1 tabular-nums">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span title="File size" className="px-1 tabular-nums">
          {size}
        </span>
        <span title="Line separator" className="px-1">
          {eol}
        </span>
        <span title="File encoding" className="px-1">
          UTF-8
        </span>
        <span title="Indentation" className="px-1">
          {indent}
        </span>
      </span>
    </footer>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Guess tabs vs spaces from the most common leading indent. */
function detectIndent(content: string): string {
  let tabs = 0;
  const widths = new Map<number, number>();
  for (const line of content.split('\n')) {
    if (line.startsWith('\t')) {
      tabs += 1;
      continue;
    }
    const match = /^ +/.exec(line);
    if (match) {
      const width = match[0].length;
      widths.set(width, (widths.get(width) ?? 0) + 1);
    }
  }
  const spaced = [...widths.values()].reduce((sum, count) => sum + count, 0);
  if (tabs > spaced && tabs > 0) {
    return 'Tabs';
  }
  if (widths.size === 0) {
    return 'Spaces: 2';
  }
  const top = [...widths.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 2;
  return top % 4 === 0 ? 'Spaces: 4' : 'Spaces: 2';
}
