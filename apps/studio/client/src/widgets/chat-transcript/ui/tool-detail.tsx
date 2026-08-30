import { ExpandableScroll } from '@/shared/ui/expandable-scroll';
import { ToolCodeView } from '@/shared/ui/tool-code-view';
import { ToolDiffView } from '@/shared/ui/tool-diff-view';

import type { HttpDetail, TerminalDetail, ToolDetail } from '../model/tool-output';
import { ToolEntriesView, ToolGrepView } from './tool-entries-view';

export function ToolDetailView({ detail }: { detail: ToolDetail }) {
  return <div className="mt-1 overflow-hidden">{renderContent(detail)}</div>;
}

function renderContent(detail: ToolDetail) {
  switch (detail.type) {
    case 'diff':
      return <ToolDiffView detail={detail} />;

    case 'file':
      return (
        <ToolCodeView
          lines={detail.lines}
          language={detail.language}
          copyText={detail.rawContent}
        />
      );

    case 'entries':
      return <ToolEntriesView detail={detail} />;

    case 'grep':
      return <ToolGrepView detail={detail} />;

    case 'terminal':
      return <TerminalView detail={detail} />;

    case 'http':
      return <HttpView detail={detail} />;

    case 'generic':
      return (
        <ToolCodeView lines={detail.lines} language={detail.language} copyText={detail.text} />
      );
  }
}

function TerminalView({ detail }: { detail: TerminalDetail }) {
  return (
    <div className="ml-4 overflow-hidden rounded-md font-mono text-[12px] leading-5">
      <ExpandableScroll>
        <div className="whitespace-pre p-2.5 font-mono text-[12px] text-foreground/90">
          {detail.output}
        </div>
      </ExpandableScroll>
    </div>
  );
}

function HttpView({ detail }: { detail: HttpDetail }) {
  const isJson = detail.body.trim().startsWith('{') || detail.body.trim().startsWith('[');

  let formattedBody = detail.body;
  if (isJson) {
    try {
      formattedBody = JSON.stringify(JSON.parse(detail.body), null, 2);
    } catch {
      // keep original
    }
  }

  const lines = formattedBody.split('\n').map((text, idx) => ({ number: idx + 1, text }));

  return (
    <ToolCodeView lines={lines} language={isJson ? 'json' : undefined} copyText={formattedBody} />
  );
}
