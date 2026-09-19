import type { OnMount } from '@monaco-editor/react';
import { useIdeStore } from '@/features/ide';
import { openWorkspaceFile } from '@/features/open-file';
import { findRelativeImportSpecs, resolveImportToWorkspacePath } from './resolve-import-path';

type Monaco = Parameters<OnMount>[1];
type MonacoEditor = Parameters<OnMount>[0];
export type ImportLinkContext = {
  workspaceId: string;
  agentId?: string;
  filePath: string;
};
type TextModel = {
  getLineCount(): number;
  getLineContent(lineNumber: number): string;
};
type LinkResource = {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;
};
const LINK_SCHEME = 'harnesys-file';
const LINK_LANGUAGES = ['typescript', 'javascript'] as const;
const contextRef: {
  current: ImportLinkContext | null;
} = { current: null };
let providersRegistered = false;
export function setMonacoImportLinkContext(ctx: ImportLinkContext) {
  contextRef.current = ctx;
}
async function openImportSpec(spec: string): Promise<boolean> {
  const ctx = contextRef.current;
  if (!ctx) {
    return false;
  }
  const target = await resolveImportToWorkspacePath(ctx.workspaceId, ctx.filePath, spec);
  if (!target) {
    return false;
  }
  openWorkspaceFile(ctx.workspaceId, target);
  useIdeStore.getState().openFile(ctx.workspaceId, target);
  return true;
}
function relativeSpecFromFileUri(resource: LinkResource): string | null {
  if (resource.authority && resource.authority !== '') {
    return null;
  }
  const raw = resource.path.replace(/^\/+/, '');
  if (!raw) {
    return null;
  }
  if (
    raw.startsWith('Users/') ||
    raw.startsWith('home/') ||
    raw.startsWith('private/') ||
    raw.startsWith('Volumes/') ||
    raw.startsWith('tmp/') ||
    raw.startsWith('var/') ||
    raw.startsWith('etc/') ||
    /^[A-Za-z]:[\\/]/.test(raw)
  ) {
    return null;
  }
  if (raw.startsWith('./') || raw.startsWith('../')) {
    return raw;
  }
  return `./${raw}`;
}
export function ensureMonacoImportLinkProviders(monaco: Monaco) {
  if (providersRegistered) {
    return;
  }
  providersRegistered = true;
  const provideLinks = (model: TextModel) => {
    if (!contextRef.current) {
      return { links: [] };
    }
    const links = [];
    const lineCount = model.getLineCount();
    for (let line = 1; line <= lineCount; line += 1) {
      const specs = findRelativeImportSpecs(model.getLineContent(line));
      for (const match of specs) {
        const url = monaco.Uri.from({
          scheme: LINK_SCHEME,
          path: '/',
          query: `spec=${encodeURIComponent(match.spec)}`,
        });
        links.push({
          range: {
            startLineNumber: line,
            startColumn: match.startColumn,
            endLineNumber: line,
            endColumn: match.endColumn,
          },
          url,
          tooltip: `Open ${match.spec}`,
        });
      }
    }
    return { links };
  };
  for (const language of LINK_LANGUAGES) {
    monaco.languages.registerLinkProvider(language, { provideLinks });
  }
}
export function bindMonacoImportLinkOpener(editor: MonacoEditor, monaco: Monaco): () => void {
  const openerDisposable = monaco.editor.registerLinkOpener({
    open(resource: LinkResource) {
      if (resource.scheme === LINK_SCHEME) {
        const spec = new URLSearchParams(resource.query).get('spec');
        if (!spec) {
          return false;
        }
        return openImportSpec(spec);
      }
      if (resource.scheme === 'file') {
        const spec = relativeSpecFromFileUri(resource);
        if (!spec) {
          return false;
        }
        return openImportSpec(spec);
      }
      return false;
    },
  });
  const mouseDisposable = editor.onMouseDown((event) => {
    if (!(event.event.metaKey || event.event.ctrlKey) || event.event.rightButton) {
      return;
    }
    const position = event.target.position;
    if (!position) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const match = findRelativeImportSpecs(model.getLineContent(position.lineNumber)).find(
      (item) => position.column >= item.startColumn && position.column < item.endColumn,
    );
    if (!match) {
      return;
    }
    event.event.preventDefault();
    event.event.stopPropagation();
    void openImportSpec(match.spec);
  });
  return () => {
    openerDisposable.dispose();
    mouseDisposable.dispose();
  };
}
