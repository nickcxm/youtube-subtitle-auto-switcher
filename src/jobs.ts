export type JobState = 'queued' | 'running' | 'done' | 'error';
export type JobSnapshot<T> = { state: JobState; data?: T; error?: string };
type Job<T> = { id: string; owner: string; state: JobState; controller: AbortController; execute?: (signal: AbortSignal) => Promise<T>; timer?: ReturnType<typeof setTimeout>; data?: T; error?: string; ended?: number };
export class JobQueue<T = unknown> {
  private jobs = new Map<string, Job<T>>();
  private pending: Job<T>[] = [];
  private running = false;
  lastActivity = Date.now();
  constructor(private waitMs = 180000, private retentionMs = 60000) {}
  submit(owner: string, execute: (signal: AbortSignal) => Promise<T>): string {
    this.prune();
    if (this.pending.length >= 20) throw new Error('本地任务过多，请稍后重试');
    const job: Job<T> = { id: crypto.randomUUID(), owner, state: 'queued', controller: new AbortController(), execute };
    job.timer = setTimeout(() => { if (job.state === 'queued') this.cancel(job.id, owner, '排队超时，请重试'); }, this.waitMs);
    this.jobs.set(job.id, job); this.pending.push(job); this.lastActivity = Date.now();
    void this.drain(); return job.id;
  }
  poll(id: string, owner: string): JobSnapshot<T> {
    this.prune(); const job = this.jobs.get(id);
    if (!job || job.owner !== owner) throw new Error('任务已结束或过期，请重试');
    const snapshot = { state: job.state, data: job.data, error: job.error };
    if (job.state === 'done' || job.state === 'error') this.jobs.delete(id);
    return snapshot;
  }
  cancel(id: string, owner: string, reason = '操作已取消') {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner || job.state === 'done' || job.state === 'error') return;
    job.controller.abort(); job.error = reason;
    if (job.state === 'queued') { job.state = 'error'; job.ended = Date.now(); job.execute = undefined; clearTimeout(job.timer); }
  }
  get idle() { this.prune(); return !this.running && this.pending.every(job => job.state !== 'queued'); }
  private prune() { for (const [id, job] of this.jobs) if (job.ended && Date.now() - job.ended > this.retentionMs) this.jobs.delete(id); }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const job = this.pending.shift()!;
        clearTimeout(job.timer); if (job.state !== 'queued') continue;
        job.state = 'running';
        const execute = job.execute!; job.execute = undefined;
        try { job.data = await execute(job.controller.signal); job.state = job.controller.signal.aborted ? 'error' : 'done'; }
        catch (error) { job.state = 'error'; job.error = error instanceof Error ? error.message : String(error); }
        job.ended = Date.now(); this.lastActivity = job.ended;
      }
    } finally { this.running = false; this.prune(); }
  }
}
