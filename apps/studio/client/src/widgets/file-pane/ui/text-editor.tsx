import Editor, { type OnMount } from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIdeStore } from '@/features/ide';
import { attachLspBridge, type LspBridge, type LspBridgeStatus } from '@/features/lsp-bridge';
import { markWorkspaceFileDirty } from '@/features/open-file';
import { readWorkspaceFileText, writeWorkspaceFileContent } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { monaco } from '@/shared/lib/monaco';
import { detectLanguage } from '@/shared/lib/tool-code';
import { useTheme } from '@/shared/ui/theme-provider';
import { LspStatusIndicator } from './lsp-status-indicator';
import {
  bindMonacoImportLinkOpener,
  ensureMonacoImportLinkProviders,
  setMonacoImportLinkContext,
} from './monaco-import-links';
import { ensureJsxTagSemanticTokens } from './monaco-jsx-tags';
import { defineAppThemes } from './monaco-themes';

type FileContent = string;

export function TextEditor({
  workspaceId,
  path,
  dirty,
}: {
  workspaceId: string;
  path: string;
  dirty: boolean;
}) {
  const { theme } = useTheme();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [viewPath, setViewPath] = useState<string | null>(null);
  const resolved = resolveAppTheme(theme);
  const contentQuery = useQuery({
    queryKey: ['workspace-file-content', workspaceId, path],
    queryFn: () => readWorkspaceFileText(workspaceId, path),
  });

  useEffect(() => {
    if (Object.hasOwn(draftsRef.current, path)) {
      setViewPath(path);
      return;
    }
    if (contentQuery.data === undefined) {
      return;
    }
    const text = contentQuery.data;
    setDrafts((prev) => (Object.hasOwn(prev, path) ? prev : { ...prev, [path]: text }));
    setViewPath(path);
  }, [path, contentQuery.data]);

  const savingRef = useRef<Set<string>>(new Set());
  const lastActiveRef = useRef<string | null>(null);

  const persistFile = useCallback(
    async (targetPath: string, content: string) => {
      await writeWorkspaceFileContent(workspaceId, { path: targetPath, content });
      qc.setQueryData(['workspace-file-content', workspaceId, targetPath], content);
      setDrafts((prev) => ({ ...prev, [targetPath]: content }));
      markWorkspaceFileDirty(workspaceId, targetPath, false);
      useIdeStore.getState().setFileDirty(workspaceId, targetPath, false);
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
    },
    [workspaceId, qc],
  );

  /** Autosave unit: persist only when the draft differs from the server copy. */
  const flushIfDirty = useCallback(
    async (targetPath: string) => {
      if (savingRef.current.has(targetPath)) {
        return;
      }
      const draft = draftsRef.current[targetPath];
      if (draft === undefined) {
        return;
      }
      const serverText =
        qc.getQueryData<FileContent>(['workspace-file-content', workspaceId, targetPath]) ?? '';
      if (draft === serverText) {
        return;
      }
      savingRef.current.add(targetPath);
      try {
        await persistFile(targetPath, draft);
      } catch {
        // keep the dirty flag; the next focus change or Ctrl+S retries
      } finally {
        savingRef.current.delete(targetPath);
      }
    },
    [workspaceId, qc, persistFile],
  );

  /** Autosave: flush the previously shown file when focus moves to another file. */
  useEffect(() => {
    const prevPath = lastActiveRef.current;
    lastActiveRef.current = path;
    if (prevPath && prevPath !== path) {
      void flushIfDirty(prevPath);
    }
  }, [path, flushIfDirty]);

  useEffect(() => {
    return () => {
      const active = lastActiveRef.current;
      if (active) {
        void flushIfDirty(active);
      }
    };
  }, [flushIfDirty]);

  const saveMutation = useMutation({
    mutationFn: (input: { path: string; content: string }) =>
      writeWorkspaceFileContent(workspaceId, input),
    onSuccess: (_, input) => {
      qc.setQueryData(['workspace-file-content', workspaceId, input.path], input.content);
      setDrafts((prev) => ({ ...prev, [input.path]: input.content }));
      markWorkspaceFileDirty(workspaceId, input.path, false);
      useIdeStore.getState().setFileDirty(workspaceId, input.path, false);
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(workspaceId) });
      void qc.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'git', 'file-status'] });
    },
  });

  const activePath = viewPath;
  const value = activePath ? (drafts[activePath] ?? '') : '';
  const serverText =
    activePath === path
      ? (contentQuery.data ?? '')
      : (qc.getQueryData<FileContent>(['workspace-file-content', workspaceId, activePath ?? '']) ??
        '');

  const save = useCallback(() => {
    if (!activePath || activePath !== path) {
      return;
    }
    const draft = drafts[path];
    if (draft === undefined || !dirty || saveMutation.isPending || savingRef.current.has(path)) {
      return;
    }
    saveMutation.mutate({ path, content: draft });
  }, [activePath, path, drafts, dirty, saveMutation]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  const importLinksDisposeRef = useRef<(() => void) | null>(null);

  const [lspStatus, setLspStatus] = useState<LspBridgeStatus>('off');
  const [lspPulse, setLspPulse] = useState(0);

  useLayoutEffect(() => {
    setMonacoImportLinkContext({
      workspaceId,
      filePath: viewPath ?? path,
    });
  }, [workspaceId, viewPath, path]);

  useEffect(() => {
    if (!activePath) {
      return;
    }
    let bridge: LspBridge | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const tryAttach = () => {
      attempts += 1;
      const modelPath = toModelPath(activePath);
      if (monaco.editor.getModel(monaco.Uri.parse(modelPath))) {
        bridge = attachLspBridge({
          workspaceId,
          path: activePath,
          monaco,
          onStatus: setLspStatus,
          onActivity: () => setLspPulse((n) => n + 1),
        });
        return;
      }
      if (attempts < 20) {
        retryTimer = setTimeout(tryAttach, 100);
      }
    };
    tryAttach();
    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      bridge?.dispose();
      setLspStatus('off');
    };
  }, [workspaceId, activePath]);

  useEffect(() => {
    return () => {
      importLinksDisposeRef.current?.();
      importLinksDisposeRef.current = null;
    };
  }, []);

  const handleBeforeMount = (monaco: Parameters<OnMount>[1]) => {
    defineAppThemes(monaco);
    ensureJsxTagSemanticTokens(monaco);
    ensureMonacoImportLinkProviders(monaco);
  };

  const handleMount: OnMount = (editor, monaco) => {
    importLinksDisposeRef.current?.();
    importLinksDisposeRef.current = bindMonacoImportLinkOpener(editor, monaco);
    editor.updateOptions({
      // occurrencesHighlight: 'off',
      // selectionHighlight: false,
    });
    // Re-apply theme after define to ensure transparent highlights take effect
    // (defineAppThemes called in beforeMount, but may have been cached)
    defineAppThemes(monaco);
    ensureJsxTagSemanticTokens(monaco);
    const nextTheme = resolved === 'dark' ? 'harnesys-dark' : 'harnesys-light';
    monaco.editor.setTheme(nextTheme);
  };

  const options: editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    stickyScroll: {
      enabled: false,
    },
    fontSize: 13,
    fontFamily: 'Monaco, IBM Plex Mono, ui-monospace, monospace',
    // fontLigatures: false,
    // wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 0, bottom: 64 },
    // renderLineHighlight: 'line' as const,
    //
    // overviewRulerLanes: 0,
    // hideCursorInOverviewRuler: true,
    // overviewRulerBorder: false,
    // guides: { indentation: false, bracketPairs: false },
    // bracketPairColorization: { enabled: false },
    // links: true,
    // matchBrackets: 'near' as const,
    // folding: true,
    // glyphMargin: false,
    // lineDecorationsWidth: 8,
    // lineNumbersMinChars: 3,
    // renderWhitespace: 'none' as const,
    // contextmenu: true,
    smoothScrolling: true,
    fastScrollSensitivity: 5, // Ускоряет отклик на колесико

    // Отключаем лишние тяжелые перерасчеты разметки на лету
    // folding: false,                  // Отключить стрелочки сворачивания блоков (они сильно тормозят скролл)
    links: false, // Отключить парсинг ссылок при движении
    scrollbar: {
      alwaysConsumeMouseWheel: true, // Захватывает скролл, не отдавая его родителю
      verticalScrollbarSize: 8, // Единый размер со скроллбаром приложения (base.css)
      horizontalScrollbarSize: 8,
      useShadows: false,
    },
    // stopRenderingLineAfter: -1,
    // scrollbar: {
    //   verticalScrollbarSize: 8,
    //   horizontalScrollbarSize: 8,
    //   useShadows: false,
    // },
    // scrollbar: {
    //   // Включаем аппаратную обработку скролла в самом редакторе
    //   useShadows: false,
    //   verticalHasArrows: false,
    //   horizontalHasArrows: false,
    //   vertical: 'visible',
    //   horizontal: 'visible',
    //   verticalScrollbarSize: 10,
    //   horizontalScrollbarSize: 10
    // }
    // cursorBlinking: 'smooth' as const,
    // cursorSmoothCaretAnimation: 'off' as const,
    // wordWrapOverride1: 'off' as const,
  };

  if (!activePath) {
    if (contentQuery.isError) {
      return (
        <div className="flex flex-1 items-center justify-center bg-background px-4 text-muted-foreground text-sm">
          Failed to load file
        </div>
      );
    }
    return (
      <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
        <Loader2Icon className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 bg-background" data-testid="text-editor">
      <LspStatusIndicator status={lspStatus} pulse={lspPulse} />
      <Editor
        height="100%"
        path={toModelPath(activePath)}
        language={detectLanguage(activePath) ?? 'plaintext'}
        theme={resolved === 'dark' ? 'harnesys-dark' : 'harnesys-light'}
        value={value}
        loading={null}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(next) => {
          const text = next ?? '';
          setDrafts((prev) => ({ ...prev, [activePath]: text }));
          const dirty = text !== serverText;
          markWorkspaceFileDirty(workspaceId, activePath, dirty);
          useIdeStore.getState().setFileDirty(workspaceId, activePath, dirty);
        }}
        options={options}
      />
    </div>
  );
}

function resolveAppTheme(theme: 'dark' | 'light' | 'system'): 'dark' | 'light' {
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

/** Monaco model URI matching the wire format of /api/lsp: file:///<relative>. */
function toModelPath(path: string): string {
  return `file:///${path.replace(/^\/+/, '')}`;
}
