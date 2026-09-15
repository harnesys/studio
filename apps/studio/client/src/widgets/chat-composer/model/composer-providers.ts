import type { SkillOption } from './skill-source';
import type { SlashCommand } from './slash-commands';
import { SLASH_COMMANDS } from './slash-commands';

export function commandItems(query: string): SlashCommand[] {
  const normalized = query.toLowerCase();
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(normalized));
}

export function pickerItems(query: string, options: SkillOption[]): SkillOption[] {
  const normalized = query.toLowerCase();
  return options.filter((option) => option.name.toLowerCase().startsWith(normalized));
}
