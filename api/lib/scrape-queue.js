/**
 * B1 — In-memory scrape queue with concurrency limit + retry + backoff.
 *
 * Why we need a real queue (not just execFile):
 *   - The dashboard "Scrape Now" button + Make.com webhook + scheduled cron can all
 *     fire scrapes at the same time. Without serialisation, two scrapers race on
 *     the same client's data/ files and one wins, one loses.
 *   - Transient platform errors (rate limits, network blips) need automatic retry
 *     with exponential backoff, not "user clicks again 30s later".
 *   - Failed jobs should land in a dead-letter list so we can see WHY a client
 *     has been silently failing for 3 days.
 *
 * Design: classic single-process queue. Max 1 scrape in-flight by default
 * (scrapers are I/O + browser heavy, parallelism doesn't help). Retries 2x
 * with 30s / 120s backoff before dead-lettering.
 *
 * Not Redis. Not BullMQ. Not Temporal. It's 100 lines of JS that survives
 * a server restart by replaying any unfinished jobs from disk on boot.
 */

import { execFile } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

class ScrapeQueue {
  constructor(opts = {}) {
    this.maxConcurrent = opts.maxConcurrent || 1;
    this.maxAttempts = opts.maxAttempts || 3;
    this.backoffMs = opts.backoffMs || [30_000, 120_000];
    this.rootDir = opts.rootDir;
    this.statePath = join(this.rootDir, 'logs', 'scrape-queue-state.json');
    this.pending = [];          // jobs waiting
    this.running = new Map();   // jobId -> { job, startedAt, child }
    this.completed = new Map(); // jobId -> job (LRU of last 50)
    this.deadLetter = [];       // permanently failed
    this._restore();
  }

  _restore() {
    if (!existsSync(this.statePath)) return;
    try {
      const s = JSON.parse(readFileSync(this.statePath, 'utf-8'));
      this.pending = s.pending || [];
      this.deadLetter = s.deadLetter || [];
      for (const c of (s.completed || []).slice(-50)) this.completed.set(c.jobId, c);
    } catch {}
  }

  _persist() {
    try {
      writeFileSync(this.statePath, JSON.stringify({
        pending: this.pending,
        deadLetter: this.deadLetter.slice(-100),
        completed: [...this.completed.values()].slice(-50),
        running: [...this.running.values()].map(r => ({ ...r.job, status: 'interrupted' })),
      }, null, 2));
    } catch (e) { /* non-fatal */ }
  }

  enqueue(opts = {}) {
    const job = {
      jobId: 'scrape-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      clientId: opts.clientId || null,
      mode: opts.mode || null,
      requestedBy: opts.requestedBy || 'unknown',
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      status: 'queued',
      stdout: '',
      stderr: '',
    };
    this.pending.push(job);
    this._persist();
    setImmediate(() => this._tick());
    return job;
  }

  status(jobId) {
    const r = this.running.get(jobId); if (r) return r.job;
    const c = this.completed.get(jobId); if (c) return c;
    const p = this.pending.find(j => j.jobId === jobId); if (p) return p;
    const d = this.deadLetter.find(j => j.jobId === jobId); if (d) return d;
    return null;
  }

  snapshot() {
    return {
      maxConcurrent: this.maxConcurrent,
      pending: this.pending,
      running: [...this.running.values()].map(r => r.job),
      recentCompleted: [...this.completed.values()].slice(-10),
      deadLetter: this.deadLetter.slice(-20),
    };
  }

  _tick() {
    while (this.running.size < this.maxConcurrent && this.pending.length > 0) {
      const job = this.pending.shift();
      this._spawn(job);
    }
    this._persist();
  }

  _spawn(job) {
    job.status = 'running';
    job.attempts += 1;
    job.startedAt = new Date().toISOString();
    const args = ['scraper/index.js'];
    if (job.clientId) args.push('--client', job.clientId);
    if (job.mode) args.push('--mode', job.mode);

    const child = execFile('node', args, {
      cwd: this.rootDir,
      timeout: 900_000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      job.stdout = (stdout || '').slice(-4000);
      job.stderr = (stderr || '').slice(-4000);
      job.finishedAt = new Date().toISOString();
      if (err) {
        job.error = err.message?.slice(0, 300);
        if (job.attempts < this.maxAttempts) {
          // Re-enqueue with backoff
          const wait = this.backoffMs[Math.min(job.attempts - 1, this.backoffMs.length - 1)];
          job.status = 'retry-pending';
          job.nextRetryAt = new Date(Date.now() + wait).toISOString();
          setTimeout(() => {
            job.status = 'queued';
            this.pending.push(job);
            this._tick();
          }, wait);
        } else {
          job.status = 'dead-lettered';
          this.deadLetter.push(job);
          this.completed.set(job.jobId, job);
        }
      } else {
        job.status = 'success';
        this.completed.set(job.jobId, job);
      }
      this.running.delete(job.jobId);
      this._tick();
    });

    if (child.stdout) child.stdout.on('data', d => { job.stdout = (job.stdout + d.toString()).slice(-4000); });
    if (child.stderr) child.stderr.on('data', d => { job.stderr = (job.stderr + d.toString()).slice(-4000); });

    this.running.set(job.jobId, { job, startedAt: Date.now(), child });
  }
}

let _instance = null;
export function getScrapeQueue(rootDir) {
  if (!_instance) _instance = new ScrapeQueue({ rootDir });
  return _instance;
}
