export { useAgentsSlideStore } from './model/agents-slide.store';
export {
  type AgentFileTab,
  type AgentOpenFiles,
  type DeskHydrateStatus,
  type InspectorTab,
  useDeskStore,
  type WorkspaceFileTab,
  type WorkspaceOpenFiles,
} from './model/desk.store';
export { scheduleMarkThreadRead } from './model/mark-thread-read';
export { refreshThread } from './model/refresh-thread';
export {
  useAgentHasUnread,
  useAgentLiveStatus,
  useThreadWaiting,
} from './model/use-agent-live-status';
export {
  useAgentThreads,
  useDesk,
  useDeskSelection,
  useSelectedAgent,
  useSelectedThread,
  useThreadEvents,
  useWorkspaceAgents,
  useWorkspaceSchedules,
  useWorkspaceWebhooks,
} from './model/use-desk';
export { DeskSync } from './ui/desk-sync';
