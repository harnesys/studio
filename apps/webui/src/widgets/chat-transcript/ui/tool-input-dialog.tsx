import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { ToolCodeView } from '@/shared/ui/tool-code-view';
import { formatToolInput } from '../model/tool-output';

type ToolInputDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolName: string;
  rawInput: string | undefined;
};
export function ToolInputDialog({ open, onOpenChange, toolName, rawInput }: ToolInputDialogProps) {
  const [copied, setCopied] = useState(false);
  const { json, formatted } = formatToolInput(rawInput);
  const lines = formatted.split('\n').map((text, idx) => ({ number: idx + 1, text }));
  const onCopy = async () => {
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col p-4 sm:max-w-xl">
        <DialogHeader className="flex flex-row items-center justify-between pr-6 pb-1">
          <div>
            <DialogTitle className="font-semibold text-sm">
              Tool Input &mdash; <span className="font-mono text-muted-foreground">{toolName}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Full parameters supplied to the tool call
            </DialogDescription>
          </div>
          <Button
            variant="outline"
            size="xs"
            className="flex items-center gap-1 text-xs"
            onClick={onCopy}
          >
            {copied ? (
              <>
                <CheckIcon className="size-3 text-chart-1" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </DialogHeader>

        <div className="mt-2 flex-1 overflow-hidden">
          <ToolCodeView
            lines={lines}
            language={json ? 'json' : undefined}
            copyText={formatted}
            previewClassName="max-h-[60vh]"
            fullClassName="max-h-[60vh]"
            defaultExpanded
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
