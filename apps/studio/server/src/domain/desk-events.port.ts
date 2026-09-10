import type { DeskEvent } from '@harnesys/studio-shared';

export type DeskEventsInput = {
  subscribe(workspaceId: string, listener: (event: DeskEvent) => void): () => void;
  subscribeAll(listener: (event: DeskEvent) => void): () => void;
  emit(workspaceId: string, event: DeskEvent): void;
};

export type DeskEventsPort = DeskEventsInput;
