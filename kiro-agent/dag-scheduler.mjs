// dag-scheduler.mjs — dependency-aware, concurrency-capped task runner.
// Zero dependencies. Node >= 22.
//
// Design:
//  * Kahn's algorithm for ordering + cycle detection (reports the actual cycle).
//  * Event-driven loop: whenever a task settles, immediately start every task
//    whose dependencies are now all satisfied, up to `concurrency`.
//  * Failure cascade is a policy, not hardcoded: see `onFailure`.
//  * Independent branches are never killed by an unrelated failure.

import { EventEmitter } from 'node:events';

export class DagError extends Error {
  constructor(message, details) { super(message); this.name = 'DagError'; this.details = details; }
}

/** Normalize + validate. Throws DagError on duplicate ids, unknown deps, cycles. */
export function buildGraph(tasks) {
  const nodes = new Map();
  for (const t of tasks) {
    if (!t.id) throw new DagError('task without id', { task: t });
    if (nodes.has(t.id)) throw new DagError(`duplicate task id "${t.id}"`, { id: t.id });
    nodes.set(t.id, { ...t, dependsOn: [...new Set(t.dependsOn ?? [])] });
  }
  const dependents = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const n of nodes.values()) {
    for (const d of n.dependsOn) {
      if (!nodes.has(d)) throw new DagError(`task "${n.id}" depends on unknown task "${d}"`, { id: n.id, dep: d });
      if (d === n.id) throw new DagError(`task "${n.id}" depends on itself`, { cycle: [n.id, n.id] });
      dependents.get(d).push(n.id);
    }
  }
  const cycle = findCycle(nodes);
  if (cycle) throw new DagError(`dependency cycle: ${cycle.join(' -> ')}`, { cycle });
  return { nodes, dependents };
}

/** Iterative 3-colour DFS; returns one cycle as [a, b, ..., a] or null. */
export function findCycle(nodes) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map([...nodes.keys()].map((k) => [k, WHITE]));
  for (const start of nodes.keys()) {
    if (color.get(start) !== WHITE) continue;
    const stack = [[start, 0]];
    const path = [start];
    color.set(start, GREY);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [id, i] = frame;
      const deps = nodes.get(id).dependsOn;
      if (i < deps.length) {
        frame[1]++;
        const next = deps[i];
        if (color.get(next) === GREY) return [...path.slice(path.indexOf(next)), next];
        if (color.get(next) === WHITE) {
          color.set(next, GREY); path.push(next); stack.push([next, 0]);
        }
      } else {
        color.set(id, BLACK); path.pop(); stack.pop();
      }
    }
  }
  return null;
}

/** Layered topological order (Kahn). Useful for dry-run / display. */
export function topoLayers(tasks) {
  const { nodes, dependents } = buildGraph(tasks);
  const indeg = new Map([...nodes].map(([k, n]) => [k, n.dependsOn.length]));
  let layer = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
  const layers = [];
  while (layer.length) {
    layers.push(layer);
    const next = [];
    for (const id of layer) for (const c of dependents.get(id)) {
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) next.push(c);
    }
    layer = next;
  }
  return layers;
}

/**
 * Failure policies for dependents of a failed task (per-task `onFailure`, or
 * the scheduler default):
 *   'skip'     — dependents are marked skipped (default; safest, cheapest)
 *   'continue' — dependents still run (use when the dep is advisory)
 *   'repair'   — run options.repair(task, error, ctx) once; if it returns a
 *                result, the task counts as succeeded (repaired), else failed
 *   'abort'    — stop scheduling everything, let running tasks finish
 *
 * `retries` + `escalate` on a task are handled BEFORE the policy fires:
 * attempt 1 uses task.model, later attempts use task.escalate[attempt-2].
 */
export class DagScheduler extends EventEmitter {
  #opts;
  constructor(opts = {}) {
    super();
    this.#opts = {
      concurrency: 4,
      defaultOnFailure: 'skip',
      repair: null,          // async (task, error, ctx) => result | null
      verify: null,          // async (task, result, ctx) => true | string(reason)
      backoffMs: 500,
      ...opts,
    };
    if (this.#opts.concurrency < 1) throw new DagError('concurrency must be >= 1');
  }

  /**
   * @param tasks  [{ id, dependsOn?, run?, model?, escalate?, retries?, onFailure?, ... }]
   * @param runner async (task, ctx) => result   (used when task.run is absent)
   *   ctx = { attempt, model, signal, inputs: {depId: result}, bb }
   * @param bb optional Blackboard; each result is also published at `result:<id>`
   */
  async run(tasks, runner, { bb, signal: outer } = {}) {
    const { nodes, dependents } = buildGraph(tasks);
    const state = new Map();   // id -> 'pending'|'running'|'done'|'failed'|'skipped'
    const results = new Map();
    const errors = new Map();
    const attempts = new Map();
    const indeg = new Map();
    for (const [k, n] of nodes) { state.set(k, 'pending'); indeg.set(k, n.dependsOn.length); }

    const ac = new AbortController();
    outer?.addEventListener('abort', () => ac.abort(), { once: true });
    let aborted = false;
    let running = 0;
    const concurrency = this.#opts.concurrency;

    return new Promise((resolveAll) => {
      const finish = () => {
        const summary = { done: [], failed: [], skipped: [], results: {}, errors: {} };
        for (const [id, s] of state) {
          if (s === 'done') summary.done.push(id);
          else if (s === 'failed') summary.failed.push(id);
          else summary.skipped.push(id);          // pending-at-abort counts as skipped
        }
        for (const [id, r] of results) summary.results[id] = r;
        for (const [id, e] of errors) summary.errors[id] = e.message ?? String(e);
        summary.ok = summary.failed.length === 0 && summary.skipped.length === 0;
        resolveAll(summary);
      };

      const skipDescendants = (rootId, reason) => {
        const q = [...dependents.get(rootId)];
        while (q.length) {
          const id = q.shift();
          if (state.get(id) !== 'pending') continue;
          state.set(id, 'skipped');
          errors.set(id, new Error(`skipped: ${reason}`));
          this.emit('skipped', { id, because: rootId });
          q.push(...dependents.get(id));
        }
      };

      const pump = () => {
        if (!aborted) {
          for (const [id, s] of state) {
            if (running >= concurrency) break;
            if (s === 'pending' && indeg.get(id) === 0) start(id);
          }
        }
        if (running === 0) {
          // nothing running: either all settled, or remaining are blocked/aborted
          for (const [id, s] of state) if (s === 'pending') {
            state.set(id, 'skipped');
            errors.set(id, new Error(aborted ? 'skipped: aborted' : 'skipped: unmet dependencies'));
          }
          finish();
        }
      };

      const start = (id) => {
        state.set(id, 'running');
        running++;
        execute(id).finally(() => { running--; pump(); });
      };

      const execute = async (id) => {
        const task = nodes.get(id);
        const inputs = Object.fromEntries(task.dependsOn.map((d) => [d, results.get(d)]));
        const maxAttempts = 1 + (task.retries ?? 0);
        let lastErr;
        this.emit('start', { id });

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (ac.signal.aborted) { lastErr = new Error('aborted'); break; }
          attempts.set(id, attempt);
          const model = attempt === 1 ? task.model : (task.escalate?.[attempt - 2] ?? task.escalate?.at(-1) ?? task.model);
          const ctx = { attempt, model, signal: ac.signal, inputs, bb };
          try {
            const result = await (task.run ?? runner)(task, ctx);
            if (this.#opts.verify) {
              const v = await this.#opts.verify(task, result, ctx);
              if (v !== true) throw new Error(`verification failed: ${typeof v === 'string' ? v : 'rejected'}`);
            }
            results.set(id, result);
            bb?.set(`result:${id}`, result, { by: id });
            state.set(id, 'done');
            this.emit('done', { id, attempt, model });
            for (const c of dependents.get(id)) indeg.set(c, indeg.get(c) - 1);
            return;
          } catch (err) {
            lastErr = err;
            this.emit('attempt-failed', { id, attempt, model, error: err.message });
            if (attempt < maxAttempts) {
              // Never retry the identical call blindly: escalate model (above) and back off.
              await sleep(this.#opts.backoffMs * 2 ** (attempt - 1), ac.signal);
            }
          }
        }

        // all attempts exhausted -> failure policy
        const policy = task.onFailure ?? this.#opts.defaultOnFailure;
        if (policy === 'repair' && this.#opts.repair) {
          try {
            const repaired = await this.#opts.repair(task, lastErr, { inputs, bb, signal: ac.signal });
            if (repaired !== null && repaired !== undefined) {
              results.set(id, repaired);
              bb?.set(`result:${id}`, repaired, { by: `${id}:repair` });
              state.set(id, 'done');
              this.emit('repaired', { id });
              for (const c of dependents.get(id)) indeg.set(c, indeg.get(c) - 1);
              return;
            }
          } catch (repairErr) {
            lastErr = new Error(`${lastErr.message}; repair failed: ${repairErr.message}`);
          }
        }
        state.set(id, 'failed');
        errors.set(id, lastErr);
        this.emit('failed', { id, error: lastErr.message, policy });
        if (policy === 'continue') {
          for (const c of dependents.get(id)) indeg.set(c, indeg.get(c) - 1);
        } else if (policy === 'abort') {
          aborted = true; ac.abort();
        } else {
          skipDescendants(id, `dependency "${id}" failed`);
        }
      };

      pump();
    });
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);   // not unref'd: a retry backoff is live work
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
