import { textToLines } from '@/shared/lib/tool-code';
import { Markdown } from '@/shared/ui/markdown';
import { ToolCodeView } from '@/shared/ui/tool-code-view';
import { ToolDiffView } from '@/shared/ui/tool-diff-view';
import type { ToolInputPreview } from '../model/tool-input-summary';

const HITL_VIEW = 'ml-0 mt-1';
const HITL_PREVIEW = 'max-h-36';
export function HitlPreview({ preview }: { preview: ToolInputPreview }) {
  switch (preview.kind) {
    case 'code':
      return (
        <ToolCodeView
          lines={textToLines(preview.text)}
          language={preview.language}
          copyText={preview.text}
          className={HITL_VIEW}
          previewClassName={HITL_PREVIEW}
        />
      );
    case 'markdown':
      return (
        <div className="mt-1 max-h-36 overflow-auto rounded-md bg-muted/40">
          <Markdown text={preview.text} className="px-2.5 py-2 text-[12px]" />
        </div>
      );
    case 'diff':
      return (
        <ToolDiffView
          detail={preview.detail}
          className={HITL_VIEW}
          previewClassName={HITL_PREVIEW}
        />
      );
    case 'text':
      return (
        <ToolCodeView
          lines={textToLines(preview.text)}
          copyText={preview.text}
          className={HITL_VIEW}
          previewClassName={HITL_PREVIEW}
        />
      );
  }
}
