import { loader } from '@monaco-editor/react';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getGitDiff, gitDiffQueryKey } from '@/shared/api/git';
import '@/shared/lib/monaco';
import { detectLanguage } from '@/shared/lib/tool-code';
import { useTheme } from '@/shared/ui/theme-provider';

import {
  type DiffEditorInstance,
  defineThemes,
  type MonacoInstance,
  type TextModel,
  type UpdateModelsParams,
} from './git-commit-diff-view-types';

let monacoPromise: Promise<unknown> | null = null;

export function GitCommitDiffView({
  workspaceId,
  path,
}: {
  workspaceId: string;
  path: string | null;
}) {
  const { theme } = useTheme();

  const diffQuery = useQuery({
    queryKey: path ? gitDiffQueryKey(workspaceId, path) : ['git-diff-none'],
    queryFn: () => getGitDiff(workspaceId, path as string),
    enabled: Boolean(workspaceId && path),
    staleTime: 10_000,
  });

  if (!path) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Select a file to view diff
      </div>
    );
  }

  if (diffQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (diffQuery.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-destructive text-sm">
        Failed to load diff
      </div>
    );
  }

  const data = diffQuery.data;
  if (!data) {
    return null;
  }

  if (data.isBinary) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-muted-foreground text-sm">Binary file not shown</p>
        <p className="font-mono text-muted-foreground text-xs">{data.path}</p>
      </div>
    );
  }

  const original = data.original ?? '';
  const modified = data.status === 'deleted' ? '' : (data.current ?? '');
  if (!original && !modified) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-muted-foreground text-sm">
        Empty file
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b bg-muted/30 px-3">
        <span className="truncate font-mono text-xs">{data.path}</span>
        <span className="ml-auto rounded bg-muted px-1.5 font-mono text-[9px] text-muted-foreground uppercase">
          {data.status}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <MonacoDiffEditor
          theme={theme}
          language={detectLanguage(data.path) ?? 'plaintext'}
          original={original}
          modified={modified}
          path={data.path}
        />
      </div>
    </div>
  );
}

function MonacoDiffEditor({
  theme,
  language,
  original,
  modified,
  path,
}: {
  theme: 'dark' | 'light' | 'system';
  language: string;
  original: string;
  modified: string;
  path: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);
  const modelsRef = useRef<{ original: unknown; modified: unknown } | null>(null);
  const [ready, setReady] = useState(false);

  const resolved = resolveTheme(theme);

  const disposeModels = useCallback(() => {
    const models = modelsRef.current as { original: TextModel; modified: TextModel } | null;
    if (!models) {
      return;
    }
    try {
      models.original.dispose();
    } catch {}
    try {
      models.modified.dispose();
    } catch {}
    modelsRef.current = null;
  }, []);

  const updateModels = useCallback(
    ({ monaco, editor, lang, orig, mod, filePath }: UpdateModelsParams) => {
      const prevModels = editor.getModel();
      if (prevModels) {
        try {
          editor.setModel(null);
        } catch {}
      }
      disposeModels();

      const originalModel = monaco.editor.createModel(
        orig,
        lang,
        monaco.Uri.parse(`inmemory://original/${filePath}`),
      );
      const modifiedModel = monaco.editor.createModel(
        mod,
        lang,
        monaco.Uri.parse(`inmemory://modified/${filePath}`),
      );
      modelsRef.current = { original: originalModel, modified: modifiedModel };
      try {
        editor.setModel({ original: originalModel, modified: modifiedModel });
      } catch {
        try {
          originalModel.dispose();
        } catch {}
        try {
          modifiedModel.dispose();
        } catch {}
      }
    },
    [disposeModels],
  );

  // init monaco once
  useEffect(() => {
    if (!monacoPromise) {
      monacoPromise = loader.init();
    }
    monacoPromise
      .then((monaco) => {
        defineThemes(monaco);
        setReady(true);
      })
      .catch(() => {});
  }, []);

  // create diff editor
  useEffect(() => {
    if (!ready || !containerRef.current) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const monaco = (await monacoPromise) as MonacoInstance;
      if (cancelled || !containerRef.current) {
        return;
      }
      const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        fontSize: 12,
        fontFamily: 'Monaco, IBM Plex Mono, ui-monospace, monospace',
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        renderOverviewRuler: false,
        folding: true,
        glyphMargin: false,
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        diffCodeLens: false,
        renderSideBySideInlineBreakpoint: 600,
        theme: resolved === 'dark' ? 'harnesys-dark' : 'harnesys-light',
      });
      editorRef.current = diffEditor;
      updateModels({
        monaco,
        editor: diffEditor,
        lang: language,
        orig: original,
        mod: modified,
        filePath: path,
      });
    })();
    return () => {
      cancelled = true;
      const ed = editorRef.current as DiffEditorInstance | null;
      if (ed) {
        try {
          ed.setModel(null);
          ed.dispose();
        } catch {
          // ignore dispose race
        }
        editorRef.current = null;
      }
      disposeModels();
    };
  }, [ready, path, resolved, language, updateModels, modified, original, disposeModels]);

  // theme sync
  useEffect(() => {
    if (!ready) {
      return;
    }
    monacoPromise
      ?.then((m) => {
        const monaco = m as MonacoInstance;
        monaco.editor.setTheme(resolved === 'dark' ? 'harnesys-dark' : 'harnesys-light');
      })
      .catch(() => {});
  }, [resolved, ready]);

  // update models when content/path/language changes
  useEffect(() => {
    if (!ready || !editorRef.current) {
      return;
    }
    monacoPromise
      ?.then((m) => {
        const monaco = m as MonacoInstance;
        const editor = editorRef.current as DiffEditorInstance;
        if (!editor) {
          return;
        }
        updateModels({
          monaco,
          editor,
          lang: language,
          orig: original,
          mod: modified,
          filePath: path,
        });
      })
      .catch(() => {});
  }, [language, original, modified, path, ready, updateModels]);

  return <div ref={containerRef} className="h-full w-full" />;
}

function resolveTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}
