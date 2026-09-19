export class ScheduleFireQueue {
  private readonly pending = new Map<string, string>();
  private handler: ((scheduleId: string) => Promise<void>) | null = null;
  setHandler(handler: (scheduleId: string) => Promise<void>): void {
    this.handler = handler;
  }
  enqueue(threadId: string, scheduleId: string): void {
    if (!this.pending.has(threadId)) {
      this.pending.set(threadId, scheduleId);
    }
  }
  drop(threadId: string): void {
    this.pending.delete(threadId);
  }
  onThreadIdle(threadId: string): void {
    const scheduleId = this.pending.get(threadId);
    if (!scheduleId || !this.handler) {
      return;
    }
    this.pending.delete(threadId);
    void this.handler(scheduleId).catch(() => {});
  }
}
