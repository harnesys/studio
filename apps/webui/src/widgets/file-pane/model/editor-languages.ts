import { EDITOR_LANGUAGES_STORAGE_KEY } from '@/shared/config/constants';

/**
 * Manual file-type overrides, keyed `<workspaceId>/<path>`. Used for files
 * without a recognizable extension (Dockerfile, dotfiles, extensionless scripts).
 */
export type EditorLanguageOverrides = Record<string, string>;

export function loadEditorLanguages(): EditorLanguageOverrides {
  try {
    const raw = localStorage.getItem(EDITOR_LANGUAGES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: EditorLanguageOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveEditorLanguages(overrides: EditorLanguageOverrides): void {
  try {
    localStorage.setItem(EDITOR_LANGUAGES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota / private mode
  }
}

export function editorLanguageKey(workspaceId: string, path: string): string {
  return `${workspaceId}/${path}`;
}
