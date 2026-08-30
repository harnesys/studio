import type { DeskEvent } from '../../shared/types.ts';

export type DeskEventsInput = {
  subscribe(workspaceId: string, listener: (event: DeskEvent) => void): () => void;
  emit(workspaceId: string, event: DeskEvent): void;
};

export type DeskEventsPort = DeskEventsInput;
