import { type AgentMode, DEFAULT_MODE_ID } from '@harnesys/studio-shared';

export type ComposerMode = string;

export type ComposerModeItem = {
  value: string;
  label: string;
  detail: string;
};

export function composerModeItems(modes: AgentMode[]): ComposerModeItem[] {
  return modes.map((mode) => ({
    value: mode.id,
    label: mode.name,
    detail: mode.description ?? '',
  }));
}

export function knownMode(modes: AgentMode[], id: string | null | undefined): boolean {
  return typeof id === 'string' && (id === DEFAULT_MODE_ID || modes.some((mode) => mode.id === id));
}
