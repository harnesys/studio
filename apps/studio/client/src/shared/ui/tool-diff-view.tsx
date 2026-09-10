import hljs from 'highlight.js/lib/common';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';

import { type DiffDetail, type DiffHunk, detectLanguage } from '@/shared/lib/tool-code';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';

export function ToolDiffView({
  detail,
  className,
  previewClassName,
  fullClassName,
}: {
  detail: DiffDetail;
  className?: string;
  previewClassName?: string;
  fullClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lang = detectLanguage(detail.path);

  const onCopy = async () => {
    await navigator.clipboard.writeText(detail.rawDiff);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        'group tool-code relative ml-4 overflow-hidden rounded-md font-mono text-[12px] leading-5',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1.5 right-1.5 z-10 h-5 w-5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        onClick={onCopy}
        title="Copy diff"
      >
        {copied ? <CheckIcon className="size-3 text-chart-1" /> : <CopyIcon className="size-3" />}
      </Button>

      <ExpandableScroll previewClassName={previewClassName} fullClassName={fullClassName}>
        <div className="divide-y divide-border/30">
          {detail.hunks.length === 0 ? (
            <div className="p-3 text-center text-muted-foreground">No visual diff chunks found</div>
          ) : (
            detail.hunks.map((hunk) => (
              <DiffHunkBlock key={hunk.header} hunk={hunk} language={lang} />
            ))
          )}
        </div>
      </ExpandableScroll>
    </div>
  );
}

function DiffHunkBlock({ hunk, language }: { hunk: DiffHunk; language?: string }) {
  const codeLines = hunk.lines.map((line) => {
    let html = '';
    if (language && hljs.getLanguage(language)) {
      html = hljs.highlight(line.text, { language, ignoreIllegals: true }).value;
    } else {
      html = escapeHtml(line.text);
    }
    return { ...line, html };
  });

  return (
    <div>
      <div className="select-none border-border/30 border-b bg-muted/20 px-3 py-0.5 font-mono text-[11px] text-muted-foreground/80">
        {hunk.header}
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {codeLines.map((line) => {
            const isAdd = line.type === 'add';
            const isDel = line.type === 'del';
            let lineNum = line.newLineNumber ?? line.oldLineNumber;
            if (isDel) {
              lineNum = line.oldLineNumber;
            } else if (isAdd) {
              lineNum = line.newLineNumber;
            }
            let sign = ' ';
            if (isAdd) {
              sign = '+';
            } else if (isDel) {
              sign = '-';
            }

            return (
              <tr
                key={`${line.type}:${lineNum ?? ''}:${line.text}`}
                className={cn(
                  'transition-colors',
                  isAdd && 'bg-[#6aab73]/10 text-foreground',
                  isDel && 'bg-[#e06c75]/10 text-foreground',
                  !isAdd && !isDel && 'text-foreground/90 hover:bg-muted/40',
                )}
              >
                <td
                  className={cn(
                    'w-14 select-none whitespace-nowrap border-border/40 border-r py-0.5 pr-2.5 pl-2 text-right align-top font-mono text-[11px]',
                    isAdd && 'font-medium text-[#6aab73]',
                    isDel && 'font-medium text-[#e06c75]',
                    !isAdd && !isDel && 'text-muted-foreground/60',
                  )}
                >
                  <span className="inline-block min-w-6 text-right">{lineNum ?? ''}</span>
                  <span className="ml-1 inline-block w-4 text-center font-bold">{sign}</span>
                </td>
                <td className="overflow-x-auto whitespace-pre py-0.5 pr-3 pl-3 align-top font-mono text-[12px] leading-5">
                  <span
                    className="hljs inline-block min-w-full"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escaped tokens
                    dangerouslySetInnerHTML={{ __html: line.html || ' ' }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
