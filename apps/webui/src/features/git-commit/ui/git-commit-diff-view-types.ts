export type MonacoInstance = {
  editor: {
    createModel: (value: string, language?: string, uri?: unknown) => TextModel;
    createDiffEditor: (domElement: HTMLElement, options?: unknown) => DiffEditorInstance;
    setTheme: (name: string) => void;
    defineTheme: (name: string, theme: unknown) => void;
  };
  Uri: {
    parse: (value: string) => unknown;
  };
};

export type TextModel = {
  dispose: () => void;
};

export type DiffEditorInstance = {
  setModel: (model: { original: unknown; modified: unknown } | null) => void;
  getModel: () => unknown | null;
  dispose: () => void;
};

export type UpdateModelsParams = {
  monaco: MonacoInstance;
  editor: DiffEditorInstance;
  lang: string;
  orig: string;
  mod: string;
  filePath: string;
};

export function defineThemes(monaco: unknown) {
  const m = monaco as {
    editor: {
      defineTheme: (name: string, theme: unknown) => void;
    };
  };
  try {
    m.editor.defineTheme('harnesys-dark', {
      base: 'vs-dark',
      inherit: false,
      rules: [
        { token: '', foreground: 'BCBEC4' },
        { token: 'comment', foreground: '7A7E85' },
        { token: 'keyword', foreground: 'CF8E6D' },
        { token: 'string', foreground: '6AAB73' },
        { token: 'number', foreground: '2AACB8' },
      ],
      colors: {
        'editor.background': '#0f1114',
        'editorGutter.background': '#0f1114',
      },
    });
    m.editor.defineTheme('harnesys-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#f4f5f6',
        'editorGutter.background': '#f4f5f6',
      },
    });
  } catch {
    // theme already defined
  }
}
