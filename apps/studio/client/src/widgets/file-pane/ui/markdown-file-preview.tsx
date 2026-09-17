import { Markdown } from '@/shared/ui/markdown';
import { ScrollArea } from '@/shared/ui/scroll-area';

export function MarkdownFilePreview({ text }: { text: string }) {
  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="markdown-file-preview">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <Markdown text={text} className="px-0" />
      </div>
    </ScrollArea>
  );
}
