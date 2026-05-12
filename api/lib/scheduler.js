/**
 * A8 + general scheduling — In-process task scheduler.
 *
 * For now: simple interval-based. Each task has a key, an interval in ms, and
 * a handler. Persists last-run timestamps to disk so a server restart doesn't
 * cause a thundering herd of every task firing at once.
 *
 * Currently scheduled:
 *   - wayback-weekly-archive (7 days) — fires the IA Save-Page-Now for every
 *     active client so we accumulate a real history without manual clicks.
 *   - niche-baselines-refresh (24 hours) — recompute cross-client baselines.
 *
 * Disable per task by setting env var:  SCHEDULER_DISABLE=wayback-weekly-archive,...
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'logs', 'scheduler-state.json');

function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { return {}; }
}
function saveState(s) {
  try { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch {}
}

const tasks = [];
let state = loadState();

export function registerTask(key, intervalMs, handler) {
  tasks.push({ key, intervalMs, handler });
}

export function startScheduler() {
  const disabled = (process.env.SCHEDULER_DISABLE || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const t of tasks) {
    if (disabled.includes(t.key)) {
      console.log(`[scheduler] ⊘ ${t.key} disabled via SCHEDULER_DISABLE`);
      continue;
    }
    const lastRun = state[t.key]?.lastRun ? new Date(state[t.key].lastRun).getTime() : 0;
    const sinceLast = Date.now() - lastRun;
    const initialDelay = Math.max(60_000, t.intervalMs - sinceLast); // never less than 1 min
    console.log(`[scheduler] ${t.key} next run in ${Math.round(initialDelay/60000)} min`);
    setTimeout(function fire() {
      Promise.resolve()
        .then(() => t.handler())
        .catch(err => console.error(`[scheduler] ${t.key} error:`, err.message))
        .finally(() => {
          state[t.key] = { lastRun: new Date().toISOString() };
          saveState(state);
          setTimeout(fire, t.intervalMs);
        });
    }, initialDelay);
  }
}
