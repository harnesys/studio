import { CheckIcon, CopyIcon, RotateCwIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type LspBridgeStatus, type LspSessionEntry, useLspSessions } from '@/features/lsp-bridge';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { MarkdownEditorMode } from '../model/use-markdown-editor-mode';
export type EditorCursor = {
  line: number;
  column: number;
};
export type { MarkdownEditorMode };

const AUTO_LANGUAGE = '__auto';
const LANGUAGE_OPTIONS: {
  id: string;
  label: string;
}[] = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'html', label: 'HTML' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'toml', label: 'TOML' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'ini', label: 'INI' },
];
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
const LSP_HINT: Record<LspBridgeStatus, string> = {
  live: 'Connected',
  starting: 'Connecting…',
  error: 'Server start failed',
  off: 'No server for this file',
};
const SEGMENT = 'flex shrink-0 items-center gap-1 px-1 hover:text-foreground';
export function EditorStatusBar({
  workspaceId,
  path,
  detectedLanguage,
  languageOverride,
  languageId,
  lspStatus,
  lspPulse,
  dirty,
  cursor,
  content,
  onSelectLanguage,
  markdownMode,
  onSelectMarkdownMode,
  onRestartFileServer,
}: {
  workspaceId: string;
  path: string;
  detectedLanguage: string;
  languageOverride: string | null;
  languageId: string;
  lspStatus: LspBridgeStatus;
  lspPulse: number;
  dirty: boolean;
  cursor: EditorCursor;
  content: string;
  onSelectLanguage: (language: string | null) => void;
  markdownMode?: MarkdownEditorMode;
  onSelectMarkdownMode?: (mode: MarkdownEditorMode) => void;
  onRestartFileServer: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const sessions = useLspSessions(workspaceId);
  const size = useMemo(() => formatBytes(new TextEncoder().encode(content).length), [content]);
  const eol = useMemo(() => (content.includes('\r\n') ? 'CRLF' : 'LF'), [content]);
  const indent = useMemo(() => detectIndent(content), [content]);
  const orderedSessions = useMemo(() => orderSessions(sessions, path), [sessions, path]);
  const currentMessage = useMemo(
    () => sessions.find((session) => session.path === path)?.message,
    [sessions, path],
  );
  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <footer
      className="flex h-6 shrink-0 select-none items-center gap-1 border-border/60 border-t bg-muted/30 px-2 text-[11px] text-muted-foreground"
      data-testid="editor-status-bar"
    >
      {dirty ? (
        <span title="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-live" />
      ) : null}
      <button
        type="button"
        onClick={copyPath}
        title={`${path} — click to copy`}
        data-testid="editor-path-copy"
        className="group/path flex min-w-0 flex-1 items-center gap-1 truncate px-1 hover:text-foreground"
      >
        <span className="truncate">{path}</span>
        {copied ? (
          <CheckIcon className="size-3 shrink-0 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3 shrink-0 opacity-0 group-hover/path:opacity-70" />
        )}
      </button>
      <span className="ml-auto flex shrink-0 items-center">
        {markdownMode && onSelectMarkdownMode ? (
          <span
            className="mr-1 flex shrink-0 items-center rounded-sm border border-border/60"
            data-testid="markdown-mode-toggle"
          >
            <button
              type="button"
              title="Edit markdown source"
              data-testid="markdown-mode-edit"
              aria-pressed={markdownMode === 'edit'}
              onClick={() => onSelectMarkdownMode('edit')}
              className={cn(
                SEGMENT,
                'rounded-none first:rounded-l-[2px]',
                markdownMode === 'edit' && 'bg-muted text-foreground',
              )}
            >
              Edit
            </button>
            <button
              type="button"
              title="Preview markdown"
              data-testid="markdown-mode-view"
              aria-pressed={markdownMode === 'view'}
              onClick={() => onSelectMarkdownMode('view')}
              className={cn(
                SEGMENT,
                'rounded-none last:rounded-r-[2px]',
                markdownMode === 'view' && 'bg-muted text-foreground',
              )}
            >
              View
            </button>
          </span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Language servers"
            data-testid="lsp-popup-trigger"
            className={SEGMENT}
          >
            <span className="relative flex size-1.5">
              {lspStatus === 'live' && lspPulse > 0 ? (
                <span
                  key={lspPulse}
                  className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60"
                />
              ) : null}
              <span className={cn('relative size-1.5 rounded-full', LSP_DOT[lspStatus])} />
            </span>
            {LSP_LABEL[lspStatus]}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-72"
            data-testid="lsp-popup"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>This file</DropdownMenuLabel>
              <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs">
                <span className={cn('size-1.5 shrink-0 rounded-full', LSP_DOT[lspStatus])} />
                <span className="min-w-0 flex-1 truncate">{path}</span>
                <span className="shrink-0 text-muted-foreground">
                  {languageId} · {LSP_HINT[lspStatus]}
                </span>
                <button
                  type="button"
                  title="Restart language server"
                  data-testid="lsp-restart"
                  onClick={onRestartFileServer}
                  className="shrink-0 rounded-sm p-0.5 hover:text-foreground"
                >
                  <RotateCwIcon className="size-3" />
                </button>
              </div>
              {currentMessage ? (
                <p
                  title={currentMessage}
                  className={cn(
                    'px-1.5 pb-1 text-xs',
                    lspStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {currentMessage}
                </p>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Running sessions ({orderedSessions.length})</DropdownMenuLabel>
              {orderedSessions.length === 0 ? (
                <div className="px-1.5 py-1 text-muted-foreground text-xs">No active sessions</div>
              ) : (
                orderedSessions.map((session) => (
                  <div
                    key={session.path}
                    className="flex items-center gap-1.5 px-1.5 py-1 text-xs"
                    title={
                      session.message
                        ? `${session.path} — ${session.message}`
                        : `${session.path} — ${session.languageId}, ${session.status}`
                    }
                  >
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', LSP_DOT[session.status])}
                    />
                    <span className="min-w-0 flex-1 truncate">{session.path}</span>
                    <span className="shrink-0 text-muted-foreground">{session.languageId}</span>
                  </div>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            title={languageOverride ? `Language: ${languageId} (manual)` : 'Language: auto'}
            data-testid="language-popup-trigger"
            className={SEGMENT}
          >
            {languageId}
            {languageOverride ? <span className="text-live">•</span> : null}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            className="w-52"
            data-testid="language-popup"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>File type</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={languageOverride ?? AUTO_LANGUAGE}
                onValueChange={(value) => onSelectLanguage(value === AUTO_LANGUAGE ? null : value)}
              >
                <DropdownMenuRadioItem value={AUTO_LANGUAGE}>
                  Auto ({detectedLanguage})
                </DropdownMenuRadioItem>
                {LANGUAGE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
function orderSessions(sessions: LspSessionEntry[], currentPath: string): LspSessionEntry[] {
  return [...sessions].sort((a, b) => {
    if (a.path === currentPath) {
      return -1;
    }
    if (b.path === currentPath) {
      return 1;
    }
    return a.path.localeCompare(b.path);
  });
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
