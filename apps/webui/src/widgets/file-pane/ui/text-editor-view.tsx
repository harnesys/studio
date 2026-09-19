import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { LspBridgeStatus } from '@/features/lsp-bridge';
import type { MarkdownEditorMode } from '../model/use-markdown-editor-mode';
import { type EditorCursor, EditorStatusBar } from './editor-status-bar';
import { MarkdownFilePreview } from './markdown-file-preview';

type Monaco = Parameters<OnMount>[1];
type TextEditorViewProps = {
  workspaceId: string;
  path: string;
  value: string;
  language: string;
  detectedLanguage: string;
  languageOverride: string | null;
  theme: string;
  options: editor.IStandaloneEditorConstructionOptions;
  markdownMode: MarkdownEditorMode;
  showMarkdownMode: boolean;
  dirty: boolean;
  cursor: EditorCursor;
  lspStatus: LspBridgeStatus;
  lspPulse: number;
  beforeMount: (monaco: Monaco) => void;
  onMount: OnMount;
  onChange: (text: string) => void;
  onSelectLanguage: (language: string | null) => void;
  onSelectMarkdownMode: (mode: MarkdownEditorMode) => void;
  onRestartFileServer: () => void;
  toModelPath: (path: string) => string;
};
export function TextEditorView({
  workspaceId,
  path,
  value,
  language,
  detectedLanguage,
  languageOverride,
  theme,
  options,
  markdownMode,
  showMarkdownMode,
  dirty,
  cursor,
  lspStatus,
  lspPulse,
  beforeMount,
  onMount,
  onChange,
  onSelectLanguage,
  onSelectMarkdownMode,
  onRestartFileServer,
  toModelPath,
}: TextEditorViewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-testid="text-editor">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {markdownMode === 'view' ? (
          <MarkdownFilePreview text={value} />
        ) : (
          <Editor
            height="100%"
            path={toModelPath(path)}
            language={language}
            theme={theme}
            value={value}
            loading={null}
            beforeMount={beforeMount}
            onMount={onMount}
            onChange={(next) => onChange(next ?? '')}
            options={options}
          />
        )}
      </div>
      <EditorStatusBar
        workspaceId={workspaceId}
        path={path}
        detectedLanguage={detectedLanguage}
        languageOverride={languageOverride}
        languageId={language}
        lspStatus={lspStatus}
        lspPulse={lspPulse}
        dirty={dirty}
        cursor={cursor}
        content={value}
        onSelectLanguage={onSelectLanguage}
        markdownMode={showMarkdownMode ? markdownMode : undefined}
        onSelectMarkdownMode={showMarkdownMode ? onSelectMarkdownMode : undefined}
        onRestartFileServer={onRestartFileServer}
      />
    </div>
  );
}
