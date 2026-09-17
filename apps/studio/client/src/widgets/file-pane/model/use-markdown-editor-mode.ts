import { useCallback, useState } from 'react';
import { isMarkdownPath } from '@/features/open-file';

export type MarkdownEditorMode = 'edit' | 'view';

/** Session-only Edit/View mode for markdown paths; default View. */
export function useMarkdownEditorMode(path: string | null) {
  const [modes, setModes] = useState<Record<string, MarkdownEditorMode>>({});
  const showMarkdownMode = Boolean(path && isMarkdownPath(path));
  const markdownMode: MarkdownEditorMode =
    showMarkdownMode && path ? (modes[path] ?? 'view') : 'edit';

  const selectMarkdownMode = useCallback((targetPath: string, mode: MarkdownEditorMode) => {
    setModes((prev) => ({ ...prev, [targetPath]: mode }));
  }, []);

  return { showMarkdownMode, markdownMode, selectMarkdownMode };
}
