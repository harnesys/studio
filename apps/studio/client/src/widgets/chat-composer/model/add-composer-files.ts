import type { Modality } from '@harnesys/studio-shared';
import { toast } from '@/shared/ui/toast';

import { canAttachFile } from './model-input';

export function addComposerFiles(
  files: File[],
  inputModalities: Modality[] | undefined,
  setPending: (update: (list: File[]) => File[]) => void,
): void {
  if (files.length === 0) {
    return;
  }
  const next: File[] = [];
  for (const file of files) {
    if (!canAttachFile(file, inputModalities)) {
      toast.add({ title: `This model does not accept ${file.type || file.name}` });
      continue;
    }
    next.push(file);
  }
  if (next.length > 0) {
    setPending((list) => [...list, ...next]);
  }
}
