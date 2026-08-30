import { toClientAgent, useAgentStore } from '@/entities/agent';
import { useJournalStore } from '@/entities/journal';
import { toClientSchedule, useScheduleStore } from '@/entities/schedule';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getThread, listAgents, listSchedules, listThreads } from '@/shared/api';
import { useDeskStore } from './desk.store';

export async function hydrateDesk(workspaceId: string) {
  const [agents, summaries, schedules] = await Promise.all([
    listAgents(),
    listThreads(),
    listSchedules(workspaceId),
  ]);
  const workspaceAgents = agents
    .filter((item) => item.workspaceId === workspaceId)
    .map(toClientAgent);
  useAgentStore.getState().replaceWorkspace(workspaceId, workspaceAgents);

  const records = await Promise.all(
    summaries.filter((item) => item.workspaceId === workspaceId).map((item) => getThread(item.id)),
  );
  useThreadStore.getState().replaceWorkspace(workspaceId, records.map(toClientThread));
  const live = useJournalStore.getState().activeRuns;
  for (const record of records) {
    if (live[record.id]) {
      continue;
    }
    useJournalStore.getState().replaceJournal(record.id, record.journal);
  }
  useScheduleStore.getState().replaceWorkspace(workspaceId, schedules.map(toClientSchedule));
  useDeskStore.getState().setHydratedWorkspaceId(workspaceId);
}
