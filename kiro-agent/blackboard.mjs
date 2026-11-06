// blackboard.mjs — in-memory shared working memory for parallel agents.
// Zero dependencies. Node >= 22.
//
// Why there are no race conditions: Node runs JS on one thread, so every
// synchronous block is atomic. The only hazard is an `await` between a check
// and an act. Every method here is synchronous up to the point it hands back a
// promise, and waiters are resolved from the same synchronous `set()` call that
// stores the value, so there is no window where a value exists but a waiter
// misses it.

import { EventEmitter } from 'node:events';

export class BlackboardTimeoutError extends Error {
  constructor(key, ms) {
    super(`blackboard.waitFor("${key}") timed out after ${ms}ms`);
    this.name = 'BlackboardTimeoutError';
    this.key = key;
  }
}

export class BlackboardValidationError extends Error {
  constructor(key, reason) {
    super(`blackboard schema rejected "${key}": ${reason}`);
    this.name = 'BlackboardValidationError';
    this.key = key;
  }
}

export class BlackboardAbortError extends Error {
  constructor(key, reason) {
    super(`blackboard.waitFor("${key}") aborted: ${reason}`);
    this.name = 'BlackboardAbortError';
    this.key = key;
  }
}

/**
 * Tiny structural validator (no ajv). Supports:
 *   { type: 'object'|'array'|'string'|'number'|'boolean',
 *     required: ['a','b'], properties: { a: {type:'string'} }, items: {...} }
 * Returns null when valid, or a string describing the first problem.
 */
export function validate(schema, value, path = '$') {
  if (!schema) return null;
  const t = schema.type;
  if (t) {
    const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (actual !== t) return `${path}: expected ${t}, got ${actual}`;
  }
  if (t === 'object' || schema.properties || schema.required) {
    if (value === null || typeof value !== 'object') return `${path}: expected object`;
    for (const k of schema.required ?? []) {
      if (!(k in value)) return `${path}.${k}: required`;
    }
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      if (k in value) {
        const err = validate(sub, value[k], `${path}.${k}`);
        if (err) return err;
      }
    }
  }
  if (t === 'array' && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const err = validate(schema.items, value[i], `${path}[${i}]`);
      if (err) return err;
    }
  }
  return null;
}

export class Blackboard extends EventEmitter {
  #entries = new Map();   // key -> { value, version, setBy, expiresAt, timer }
  #waiters = new Map();   // key -> Set<{ resolve, reject, timer, cleanup }>
  #schemas = new Map();   // key (or 'prefix*') -> schema
  #closed = false;

  /** Register a schema for an exact key or a prefix ending in '*'. */
  defineSchema(keyOrPrefix, schema) {
    this.#schemas.set(keyOrPrefix, schema);
    return this;
  }

  #schemaFor(key) {
    if (this.#schemas.has(key)) return this.#schemas.get(key);
    for (const [k, s] of this.#schemas) {
      if (k.endsWith('*') && key.startsWith(k.slice(0, -1))) return s;
    }
    return null;
  }

  /**
   * Publish a value. Synchronous and atomic.
   * opts.ttlMs  — entry expires (and is deleted) after this many ms
   * opts.by     — author id, kept for provenance
   * opts.ifVersion — optimistic concurrency: only write if current version matches
   */
  set(key, value, { ttlMs, by = 'unknown', ifVersion } = {}) {
    if (this.#closed) throw new Error('blackboard is closed');
    const err = validate(this.#schemaFor(key), value);
    if (err) throw new BlackboardValidationError(key, err);

    const prev = this.#entries.get(key);
    if (ifVersion !== undefined && (prev?.version ?? 0) !== ifVersion) {
      return { ok: false, reason: 'version-conflict', current: prev?.version ?? 0 };
    }
    if (prev?.timer) clearTimeout(prev.timer);

    const entry = {
      value,
      version: (prev?.version ?? 0) + 1,
      setBy: by,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
      timer: null,
    };
    if (ttlMs) {
      entry.timer = setTimeout(() => this.#expire(key, entry), ttlMs);
      entry.timer.unref?.();   // a TTL must never keep the process alive
    }
    this.#entries.set(key, entry);

    // Resolve waiters in the same synchronous turn as the write.
    const ws = this.#waiters.get(key);
    if (ws) {
      this.#waiters.delete(key);
      for (const w of ws) { w.cleanup(); w.resolve(value); }
    }
    this.emit('set', { key, version: entry.version, by });
    this.emit(`set:${key}`, value);
    return { ok: true, version: entry.version };
  }

  #expire(key, entry) {
    if (this.#entries.get(key) === entry) {
      this.#entries.delete(key);
      this.emit('expire', { key });
    }
  }

  get(key) {
    const e = this.#entries.get(key);
    return e && (!e.expiresAt || e.expiresAt > Date.now()) ? e.value : undefined;
  }

  has(key) { return this.get(key) !== undefined; }

  meta(key) {
    const e = this.#entries.get(key);
    return e ? { version: e.version, setBy: e.setBy, expiresAt: e.expiresAt } : null;
  }

  delete(key) {
    const e = this.#entries.get(key);
    if (e?.timer) clearTimeout(e.timer);
    return this.#entries.delete(key);
  }

  keys(prefix = '') {
    return [...this.#entries.keys()].filter((k) => k.startsWith(prefix) && this.has(k));
  }

  /**
   * Resolve with the value as soon as it exists. If it already exists,
   * resolves on the next microtask — never misses a value set earlier.
   * opts.timeoutMs — reject with BlackboardTimeoutError (always set one!)
   * opts.signal    — AbortSignal; lets the DAG cancel waiting branches
   */
  waitFor(key, { timeoutMs = 60_000, signal } = {}) {
    if (this.has(key)) return Promise.resolve(this.get(key));
    if (this.#closed) return Promise.reject(new BlackboardAbortError(key, 'closed'));

    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null, cleanup: null };
      let onAbort;
      w.cleanup = () => {
        clearTimeout(w.timer);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      };
      const drop = () => {
        const set = this.#waiters.get(key);
        if (set) { set.delete(w); if (!set.size) this.#waiters.delete(key); }
      };
      w.timer = setTimeout(() => {
        drop(); w.cleanup();
        reject(new BlackboardTimeoutError(key, timeoutMs));
      }, timeoutMs);
      // NOT unref'd: a pending waitFor is live work. Unref'ing it would let Node
      // exit silently while a worker is still awaiting a key.
      if (signal) {
        if (signal.aborted) { w.cleanup(); return reject(new BlackboardAbortError(key, 'signal')); }
        onAbort = () => { drop(); w.cleanup(); reject(new BlackboardAbortError(key, 'signal')); };
        signal.addEventListener('abort', onAbort, { once: true });
      }
      let set = this.#waiters.get(key);
      if (!set) this.#waiters.set(key, (set = new Set()));
      set.add(w);
    });
  }

  /** Wait for several keys; rejects on first failure. */
  waitForAll(keys, opts) {
    return Promise.all(keys.map((k) => this.waitFor(k, opts))).then((vals) =>
      Object.fromEntries(keys.map((k, i) => [k, vals[i]])));
  }

  /** Subscribe to every write whose key starts with prefix. Returns unsubscribe. */
  subscribe(prefix, fn) {
    const h = ({ key, version, by }) => {
      if (key.startsWith(prefix)) fn(key, this.get(key), { version, by });
    };
    this.on('set', h);
    return () => this.off('set', h);
  }

  /** Plain JSON snapshot (for persistence or for the memory bridge). */
  snapshot() {
    const out = {};
    for (const k of this.keys()) out[k] = { value: this.get(k), ...this.meta(k) };
    return out;
  }

  close() {
    this.#closed = true;
    for (const e of this.#entries.values()) if (e.timer) clearTimeout(e.timer);
    for (const [key, ws] of this.#waiters) {
      for (const w of ws) { w.cleanup(); w.reject(new BlackboardAbortError(key, 'closed')); }
    }
    this.#waiters.clear();
  }
}
