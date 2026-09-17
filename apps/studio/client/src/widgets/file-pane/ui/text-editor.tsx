import type { OnMount } from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type { editor } from 'monaco-editor';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { remappedPathAfterMove, useIdeStore } from '@/features/ide';
import { markWorkspaceFileDirty } from '@/features/open-file';
import { readWorkspaceFileText, writeWorkspaceFileContent } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import '@/shared/lib/monaco';
import { detectLanguage } from '@/shared/lib/tool-code';
import { useTheme } from '@/shared/ui/theme-provider';
import {
  editorLanguageKey,
  loadEditorLanguages,
  saveEditorLanguages,
} from '../model/editor-languages';
import { createEditorOptions, editorThemeName, toModelPath } from '../model/editor-setup';
import { useEditorLspBridge } from '../model/use-editor-lsp-bridge';
import { useMarkdownEditorMode } from '../model/use-markdown-editor-mode';
import {
  bindMonacoImportLinkOpener,
  ensureMonacoImportLinkProviders,
  setMonacoImportLinkContext,
} from './monaco-import-links';
import { ensureJsxTagSemanticTokens } from './monaco-jsx-tags';
import { defineAppThemes } from './monaco-themes';
import { TextEditorView } from './text-editor-view';

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
  const [langOverrides, setLangOverrides] = useState<Record<string, string>>(() =>
    loadEditorLanguages(),
  );
  const resolved = editorThemeName(theme);
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
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

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
    if (!prevPath || prevPath === path) {
      return;
    }
    setCursor({ line: 1, column: 1 });
    if (remappedPathAfterMove(workspaceId, prevPath) === path) {
      setDrafts((prev) => {
        if (!Object.hasOwn(prev, prevPath)) {
          return prev;
        }
        const { [prevPath]: text, ...rest } = prev;
        if (Object.hasOwn(rest, path)) {
          return rest;
        }
        return { ...rest, [path]: text };
      });
      return;
    }
    void flushIfDirty(prevPath);
  }, [path, workspaceId, flushIfDirty]);

  const flushRef = useRef(flushIfDirty);
  flushRef.current = flushIfDirty;

  /** Autosave: flush the open file when the editor or window loses focus. */
  useEffect(() => {
    const flushActive = () => {
      const active = lastActiveRef.current;
      if (active) {
        void flushRef.current(active);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushActive();
      }
    };
    window.addEventListener('blur', flushActive);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', flushActive);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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

  /** Manual language override per workspace file, persisted across reloads. */
  const selectLanguage = useCallback(
    (targetPath: string, language: string | null) => {
      const key = editorLanguageKey(workspaceId, targetPath);
      const next = { ...langOverrides };
      if (language === null) {
        delete next[key];
      } else {
        next[key] = language;
      }
      setLangOverrides(next);
      saveEditorLanguages(next);
    },
    [workspaceId, langOverrides],
  );

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
  const editorSubsDisposeRef = useRef<(() => void) | null>(null);

  const [cursor, setCursor] = useState({ line: 1, column: 1 });

  const detectedLanguage = activePath ? (detectLanguage(activePath) ?? 'plaintext') : 'plaintext';
  const languageOverride = activePath
    ? (langOverrides[editorLanguageKey(workspaceId, activePath)] ?? null)
    : null;
  const language = languageOverride ?? detectedLanguage;
  const { showMarkdownMode, markdownMode, selectMarkdownMode } = useMarkdownEditorMode(activePath);
  const {
    status: lspStatus,
    pulse: lspPulse,
    restartFileServer,
  } = useEditorLspBridge(workspaceId, activePath, language);

  useLayoutEffect(() => {
    setMonacoImportLinkContext({
      workspaceId,
      filePath: viewPath ?? path,
    });
  }, [workspaceId, viewPath, path]);

  useEffect(() => {
    return () => {
      editorSubsDisposeRef.current?.();
      editorSubsDisposeRef.current = null;
      editorRef.current = null;
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
    editorRef.current = editor;
    const flushOnEditorBlur = () => {
      const active = lastActiveRef.current;
      if (active) {
        void flushRef.current(active);
      }
    };
    editorSubsDisposeRef.current?.();
    const blurText = editor.onDidBlurEditorText(flushOnEditorBlur);
    const blurWidget = editor.onDidBlurEditorWidget(flushOnEditorBlur);
    const cursorSub = editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });
    editorSubsDisposeRef.current = () => {
      blurText.dispose();
      blurWidget.dispose();
      cursorSub.dispose();
    };
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
    monaco.editor.setTheme(editorThemeName(theme));
  };

  const options = createEditorOptions();

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
    <TextEditorView
      workspaceId={workspaceId}
      path={activePath}
      value={value}
      language={language}
      detectedLanguage={detectedLanguage}
      languageOverride={languageOverride}
      theme={resolved}
      options={options}
      markdownMode={markdownMode}
      showMarkdownMode={showMarkdownMode}
      dirty={dirty}
      cursor={cursor}
      lspStatus={lspStatus}
      lspPulse={lspPulse}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(text) => {
        draftsRef.current = { ...draftsRef.current, [activePath]: text };
        setDrafts((prev) => ({ ...prev, [activePath]: text }));
        const nextDirty = text !== serverText;
        markWorkspaceFileDirty(workspaceId, activePath, nextDirty);
        useIdeStore.getState().setFileDirty(workspaceId, activePath, nextDirty);
      }}
      onSelectLanguage={(next) => selectLanguage(activePath, next)}
      onSelectMarkdownMode={(mode) => selectMarkdownMode(activePath, mode)}
      onRestartFileServer={restartFileServer}
      toModelPath={toModelPath}
    />
  );
}
