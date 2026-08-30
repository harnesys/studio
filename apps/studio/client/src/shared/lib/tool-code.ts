export type DiffHunkLine = {
  type: 'add' | 'del' | 'ctx';
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
};

export type DiffHunk = {
  header: string;
  lines: DiffHunkLine[];
};

export type DiffDetail = {
  type: 'diff';
  path: string;
  replacements?: number;
  addedCount: number;
  deletedCount: number;
  hunks: DiffHunk[];
  rawDiff: string;
};

export type CodeLine = {
  number: number;
  text: string;
};

export function textToLines(text: string): CodeLine[] {
  return text.split('\n').map((line, idx) => ({ number: idx + 1, text: line }));
}

export function detectLanguage(filepath: string): string | undefined {
  const ext = filepath.split('.').at(-1)?.toLowerCase();
  if (!ext) {
    return undefined;
  }
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
  };
  return map[ext];
}

/** Synthetic hunk from edit_file old_string / new_string (HITL, before tool runs). */
export function diffFromEdit(path: string, oldText: string, newText: string): DiffDetail {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const hunk: DiffHunk = {
    header: `@@ -1,${Math.max(oldLines.length, 1)} +1,${Math.max(newLines.length, 1)} @@`,
    lines: [
      ...oldLines.map((text, i) => ({
        type: 'del' as const,
        oldLineNumber: i + 1,
        text,
      })),
      ...newLines.map((text, i) => ({
        type: 'add' as const,
        newLineNumber: i + 1,
        text,
      })),
    ],
  };
  const rawDiff = [
    `--- a/${path || 'file'}`,
    `+++ b/${path || 'file'}`,
    hunk.header,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
  return {
    type: 'diff',
    path,
    addedCount: newLines.length,
    deletedCount: oldLines.length,
    hunks: [hunk],
    rawDiff,
  };
}
