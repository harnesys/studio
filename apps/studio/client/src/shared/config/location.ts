import { useMatch } from 'react-router';

import {
  parseWindowSettingsCategory,
  type StudioFocus,
  studioFocusThreadId,
  studioFocusWorkspaceId,
} from './routes';

export function useStudioLocation(): StudioFocus {
  const settingsCategoryMatch = useMatch('/settings/:category');
  const settingsRoot = useMatch('/settings');
  const thread = useMatch('/:workspaceId/thread/:threadId');
  const file = useMatch('/:workspaceId/file/*');
  const diff = useMatch('/:workspaceId/diff/*');
  const schedule = useMatch('/:workspaceId/schedule/:scheduleId');
  const webhook = useMatch('/:workspaceId/webhook/:webhookId');
  const spawn = useMatch('/:workspaceId/spawn/:threadId/:spawnId');

  if (settingsCategoryMatch || settingsRoot) {
    return {
      kind: 'settings',
      category: parseWindowSettingsCategory(settingsCategoryMatch?.params.category),
    };
  }

  if (thread?.params.workspaceId && thread.params.threadId) {
    return {
      kind: 'thread',
      workspaceId: thread.params.workspaceId,
      threadId: thread.params.threadId,
    };
  }

  if (file?.params.workspaceId && file.params['*']) {
    return {
      kind: 'file',
      workspaceId: file.params.workspaceId,
      path: `/${file.params['*']}`,
    };
  }

  if (diff?.params.workspaceId && diff.params['*']) {
    return {
      kind: 'diff',
      workspaceId: diff.params.workspaceId,
      path: `/${diff.params['*']}`,
    };
  }

  if (schedule?.params.workspaceId && schedule.params.scheduleId) {
    return {
      kind: 'schedule',
      workspaceId: schedule.params.workspaceId,
      scheduleId: schedule.params.scheduleId,
    };
  }

  if (webhook?.params.workspaceId && webhook.params.webhookId) {
    return {
      kind: 'webhook',
      workspaceId: webhook.params.workspaceId,
      webhookId: webhook.params.webhookId,
    };
  }

  if (spawn?.params.workspaceId && spawn.params.threadId && spawn.params.spawnId) {
    return {
      kind: 'spawn',
      workspaceId: spawn.params.workspaceId,
      threadId: spawn.params.threadId,
      spawnId: spawn.params.spawnId,
    };
  }

  return { kind: 'none' };
}

export { studioFocusThreadId, studioFocusWorkspaceId };
