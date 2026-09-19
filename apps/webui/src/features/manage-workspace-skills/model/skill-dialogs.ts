import { dialog } from '@/shared/services/overlay';

import { CreateSkillDialog } from '../ui/skill-dialogs';

export function openCreateSkillDialog() {
  return dialog.open(CreateSkillDialog, {
    title: 'New skill',
    description: 'Writes a SKILL.md under `.harnesys/skills` for this workspace.',
    className: 'sm:max-w-lg',
    testId: 'create-skill-dialog',
  });
}
