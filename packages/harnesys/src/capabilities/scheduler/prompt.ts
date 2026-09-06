export const SCHEDULER_PROMPT_FRAGMENT = `## Wake
- schedule_list / schedule_set / schedule_pause / schedule_delete / schedule_peek — cron that wakes an agent in a chosen thread.
- threadId on schedule_set (create): omit = new dedicated schedule thread (isolated cron log, peek there). self = THIS chat (wake yourself here; fire arrives in this transcript). uuid = another existing thread from thread_list (wake that conversation; set targetAgentId if that thread belongs to another agent). One schedule per thread. schedule_peek reads the fire journal of that schedule.
- Fire arrives as a \`<schedule name="…">\` wake with the schedule detail inside. That is your cron firing in this transcript.
- Write detail as a checklist of concrete work for the waking agent; do one quantum, update project files per your instructions, stop.
- Prefer schedule_set yourself for heartbeats and follow-ups; human can also manage Schedules / Webhooks in the Studio sidebar.`;

/** Attribute-safe schedule name: no quotes or angle brackets inside name="...". */
function scheduleNameAttr(name: string): string {
  return name.replaceAll('"', "'").replaceAll('<', '').replaceAll('>', '');
}

/** Wake envelope the scheduler fires into the target thread transcript. */
export function formatScheduleWake(name: string, detail: string): string {
  return `<schedule name="${scheduleNameAttr(name)}">\n${detail}\n</schedule>`;
}
