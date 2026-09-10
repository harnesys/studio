const SCHEDULED_PREFIX = /^Scheduled task "[^"]+":\n\n/;
const SCHEDULED_BLOCK = /^<schedule(?: name="([^"]*)")?>\n?([\s\S]*?)\n?<\/schedule>\s*$/;

export const SCHEDULE_HUMAN_ORIGIN = 'schedule';

export function scheduledTaskText(name: string, detail: string): string {
  return `<schedule name="${scheduleNameAttr(name)}">\n${detail}\n</schedule>`;
}

export function scheduledTaskName(text: string): string | undefined {
  const block = text.match(SCHEDULED_BLOCK);
  if (block?.[1]) {
    return block[1];
  }
  const prefix = text.match(/^Scheduled task "([^"]+)":/);
  return prefix?.[1];
}

export function visibleScheduledText(text: string): string {
  const block = text.match(SCHEDULED_BLOCK);
  if (block) {
    return (block[2] ?? '').replace(/\n$/, '');
  }
  return text.replace(SCHEDULED_PREFIX, '');
}

export function isScheduledHumanText(text: string | undefined): boolean {
  return typeof text === 'string' && (SCHEDULED_PREFIX.test(text) || SCHEDULED_BLOCK.test(text));
}

function scheduleNameAttr(name: string): string {
  return name.replaceAll('"', "'").replaceAll('<', '').replaceAll('>', '');
}
