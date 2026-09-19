import type { Hono } from 'hono';
import type { CreateScheduleInput } from '../../../application/schedules/create-schedule.use-case.ts';
import type { DeleteScheduleInput } from '../../../application/schedules/delete-schedule.use-case.ts';
import type { ListSchedulesInput } from '../../../application/schedules/list-schedules.use-case.ts';
import type { UpdateScheduleInput } from '../../../application/schedules/update-schedule.use-case.ts';
import { createScheduleBody, updateScheduleBody } from './schedule.body.ts';
export type ScheduleControllerDeps = {
  listSchedules: ListSchedulesInput;
  createSchedule: CreateScheduleInput;
  updateSchedule: UpdateScheduleInput;
  deleteSchedule: DeleteScheduleInput;
};
export class ScheduleController {
  constructor(private readonly deps: ScheduleControllerDeps) {}
  register(app: Hono): void {
    app.get('/api/workspaces/:id/schedules', async (c) => {
      const schedules = await this.deps.listSchedules.execute({
        workspaceId: c.req.param('id'),
      });
      return c.json(schedules);
    });
    app.post('/api/workspaces/:id/schedules', async (c) => {
      const body = createScheduleBody.parse(await c.req.json());
      const created = await this.deps.createSchedule.execute({
        workspaceId: c.req.param('id'),
        name: body.name,
        targetAgentId: body.targetAgentId,
        detail: body.detail,
        cron: body.cron,
        modeId: body.modeId,
        history: body.history,
        historyLast: body.historyLast,
        threadId: body.threadId,
      });
      return c.json(created, 201);
    });
    app.patch('/api/workspaces/:id/schedules/:scheduleId', async (c) => {
      const body = updateScheduleBody.parse(await c.req.json());
      const schedule = await this.deps.updateSchedule.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('scheduleId'),
        name: body.name,
        status: body.status,
        targetAgentId: body.targetAgentId,
        detail: body.detail,
        cron: body.cron,
        modeId: body.modeId,
        history: body.history,
        historyLast: body.historyLast,
        threadId: body.threadId,
      });
      return c.json(schedule);
    });
    app.delete('/api/workspaces/:id/schedules/:scheduleId', async (c) => {
      await this.deps.deleteSchedule.execute({
        workspaceId: c.req.param('id'),
        id: c.req.param('scheduleId'),
      });
      return c.body(null, 204);
    });
  }
}
