import type { editor } from 'monaco-editor';

/** Monaco editor construction options for workspace files. */
export function createEditorOptions(): editor.IStandaloneEditorConstructionOptions {
  return {
    minimap: { enabled: false },
    stickyScroll: { enabled: false },
    fontSize: 13,
    fontFamily: 'Monaco, IBM Plex Mono, ui-monospace, monospace',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    padding: { top: 0, bottom: 64 },
    smoothScrolling: true,
    fastScrollSensitivity: 5,
    links: false,
    scrollbar: {
      alwaysConsumeMouseWheel: true,
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
      useShadows: false,
    },
  };
}

export function editorThemeName(
  theme: 'dark' | 'light' | 'system',
): 'harnesys-dark' | 'harnesys-light' {
  return resolveAppTheme(theme) === 'dark' ? 'harnesys-dark' : 'harnesys-light';
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
export function toModelPath(path: string): string {
  return `file:///${path.replace(/^\/+/, '')}`;
}
