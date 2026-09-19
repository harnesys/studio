import hljs from 'highlight.js/lib/common';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import type { CodeLine } from '@/shared/lib/tool-code';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ExpandableScroll } from '@/shared/ui/expandable-scroll';

type ToolCodeViewProps = {
  lines: CodeLine[];
  language?: string;
  copyText?: string;
  previewClassName?: string;
  fullClassName?: string;
  defaultExpanded?: boolean;
  className?: string;
};
export function ToolCodeView({
  lines,
  language,
  copyText,
  previewClassName,
  fullClassName,
  defaultExpanded,
  className,
}: ToolCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const rawFull = copyText ?? lines.map((l) => l.text).join('\n');
  const code = lines.map((l) => l.text).join('\n');
  let highlighted = '';
  if (language && hljs.getLanguage(language)) {
    highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } else {
    const auto = hljs.highlightAuto(code);
    highlighted = auto.value || escapeHtml(code);
  }
  const htmlLines = highlighted.split('\n');
  const highlightedLines = lines.map((line, idx) => ({
    number: line.number,
    html: htmlLines[idx] ?? escapeHtml(line.text),
  }));
  const onCopy = async () => {
    await navigator.clipboard.writeText(rawFull);
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
        title="Copy"
      >
        {copied ? <CheckIcon className="size-3 text-chart-1" /> : <CopyIcon className="size-3" />}
      </Button>

      <ExpandableScroll
        previewClassName={previewClassName}
        fullClassName={fullClassName}
        defaultExpanded={defaultExpanded}
      >
        <table className="w-full border-collapse">
          <tbody>
            {highlightedLines.map((row) => (
              <tr key={row.number} className="transition-colors hover:bg-muted/60">
                <td className="w-10 select-none border-border/40 border-r py-0.5 pr-3 pl-2.5 text-right align-top font-mono text-[11px] text-muted-foreground/60">
                  {row.number}
                </td>
                <td className="overflow-x-auto whitespace-pre py-0.5 pr-4 pl-3.5 align-top font-mono text-foreground/90">
                  <span
                    className="hljs inline-block min-w-full"
                    dangerouslySetInnerHTML={{ __html: row.html || ' ' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ExpandableScroll>
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
