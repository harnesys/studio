import { AudioLinesIcon, FileIcon, ImageIcon, PlusIcon, VideoIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { InputGroupButton } from '@/shared/ui/input-group';
import { type AttachKind, acceptFor } from '../model/model-input';

const ITEMS: {
  kind: AttachKind;
  label: string;
  icon: typeof ImageIcon;
}[] = [
  { kind: 'image', label: 'Image', icon: ImageIcon },
  { kind: 'audio', label: 'Audio', icon: AudioLinesIcon },
  { kind: 'video', label: 'Video', icon: VideoIcon },
  { kind: 'file', label: 'File', icon: FileIcon },
];
export function AttachMenu({
  allowed,
  disabled,
  onPick,
}: {
  allowed: AttachKind[];
  disabled: boolean;
  onPick: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const blocked = disabled || allowed.length === 0;
  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              disabled={blocked}
              title={blocked && !disabled ? 'Select an agent to attach files' : 'Attach'}
            />
          }
        >
          <PlusIcon />
          <span className="sr-only">Attach</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-40">
          {ITEMS.filter((item) => allowed.includes(item.kind)).map((item) => {
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.kind} onClick={() => openPicker(item.kind)}>
                <Icon className="size-4" />
                {item.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onPick(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
    </>
  );
  function openPicker(kind: AttachKind) {
    const node = input.current;
    if (!node) {
      return;
    }
    const accept = acceptFor(kind);
    if (accept) {
      node.accept = accept;
    } else {
      node.removeAttribute('accept');
    }
    node.click();
    setOpen(false);
  }
}
