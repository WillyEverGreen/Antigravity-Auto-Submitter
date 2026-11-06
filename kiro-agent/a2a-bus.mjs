// a2a-bus.mjs — inter-agent clarification protocol.
// Zero dependencies. Node >= 22.
//
// Pattern: "orchestrator-mediated pub/sub with hard guard rails".
//  * Agents never talk to each other directly. They ask the bus; the bus
//    answers from the cheapest source first:
//        1. blackboard (free, zero tokens)
//        2. answer cache (same question already answered)
//        3. a registered responder (a peer's declared expertise, or the
//           orchestrator) — this is the only path that costs tokens
//  * Every message carries (thread, hop, from). Loop prevention is structural:
//        - hop limit        : a reply to a reply to a reply... is cut off
//        - per-agent budget : max questions each agent may ask in total
//        - per-pair budget  : max A->B questions (stops ping-pong)
//        - thread budget    : max messages in one conversation
//        - global budget    : max responder calls for the whole run
//        - answer TTL/timeout, and an answer is never allowed to be a question
//        - dedupe           : identical question from same agent is coalesced
//  * Answers are SHORT by contract (maxAnswerChars) to protect token budget.

import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

export class BusLimitError extends Error {
  constructor(code, message) { super(message); this.name = 'BusLimitError'; this.code = code; }
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const hash = (s) => createHash('sha1').update(norm(s)).digest('hex').slice(0, 16);

export class A2ABus extends EventEmitter {
  #cfg;
  #responders = [];            // { id, topics:Set, fn }
  #cache = new Map();          // questionHash -> answer
  #inflight = new Map();       // agent+hash -> Promise
  #perAgent = new Map();
  #perPair = new Map();
  #perThread = new Map();
  #globalCalls = 0;
  #log = [];

  constructor(blackboard, cfg = {}) {
    super();
    this.bb = blackboard;
    this.#cfg = {
      maxHops: 2,
      maxQuestionsPerAgent: 3,
      maxQuestionsPerPair: 2,
      maxMessagesPerThread: 6,
      maxResponderCalls: 20,
      answerTimeoutMs: 30_000,
      maxAnswerChars: 800,
      ...cfg,
    };
  }

  /**
   * Register something that can answer questions.
   * @param id       'orchestrator' | 'worker:db' ...
   * @param topics   array of strings; question.topic must match, or '*' for any
   * @param fn       async ({ question, topic, from, thread, hop }) => string | null
   *                 return null to decline (bus tries next responder)
   */
  registerResponder(id, topics, fn) {
    this.#responders.push({ id, topics: new Set(topics), fn });
    return this;
  }

  /**
   * Ask a question. Resolves to { answer, source } or rejects with BusLimitError.
   * Callers should treat a rejection as "proceed with a stated assumption",
   * never as "ask again".
   *
   * @param from   agent id
   * @param q      { question, topic?, thread?, hop?, bbKeys? }
   *               bbKeys: blackboard keys likely to hold the answer (checked first)
   */
  async ask(from, { question, topic = '*', thread = `t:${from}`, hop = 0, bbKeys = [] }) {
    // 1. blackboard — free
    for (const k of bbKeys) {
      if (this.bb.has(k)) return this.#record(from, thread, hop, question, { answer: this.bb.get(k), source: `blackboard:${k}` });
    }

    // dedupe / cache
    const h = hash(question);
    if (this.#cache.has(h)) return this.#record(from, thread, hop, question, { answer: this.#cache.get(h), source: 'cache' });
    // Coalesce by question only (not by asker): two workers asking the same thing
    // at the same moment must cost one responder call, not two.
    const flightKey = h;
    if (this.#inflight.has(flightKey)) {
      const shared = await this.#inflight.get(flightKey);
      return this.#record(from, thread, hop, question, { answer: shared.answer, source: 'coalesced' });
    }

    // guard rails (all checked BEFORE spending anything)
    const c = this.#cfg;
    if (hop > c.maxHops) throw new BusLimitError('hops', `hop limit ${c.maxHops} exceeded`);
    if ((this.#perAgent.get(from) ?? 0) >= c.maxQuestionsPerAgent) throw new BusLimitError('agent-budget', `${from} exhausted its ${c.maxQuestionsPerAgent} questions`);
    if ((this.#perThread.get(thread) ?? 0) >= c.maxMessagesPerThread) throw new BusLimitError('thread-budget', `thread ${thread} is full`);
    if (this.#globalCalls >= c.maxResponderCalls) throw new BusLimitError('global-budget', 'run-wide responder budget spent');

    const candidates = this.#responders.filter(
      (r) => r.id !== from && (r.topics.has('*') || r.topics.has(topic)));
    if (!candidates.length) throw new BusLimitError('no-responder', `no responder for topic "${topic}"`);

    const p = this.#dispatch(from, { question, topic, thread, hop }, candidates, h);
    this.#inflight.set(flightKey, p);
    try { return await p; } finally { this.#inflight.delete(flightKey); }
  }

  async #dispatch(from, msg, candidates, h) {
    const c = this.#cfg;
    this.#perAgent.set(from, (this.#perAgent.get(from) ?? 0) + 1);
    this.#perThread.set(msg.thread, (this.#perThread.get(msg.thread) ?? 0) + 1);

    for (const r of candidates) {
      const pairKey = `${from}->${r.id}`;
      if ((this.#perPair.get(pairKey) ?? 0) >= c.maxQuestionsPerPair) continue;  // ping-pong guard
      this.#perPair.set(pairKey, (this.#perPair.get(pairKey) ?? 0) + 1);
      this.#globalCalls++;

      let timer;
      try {
        const answer = await Promise.race([
          r.fn({ ...msg, from }),
          new Promise((_, rej) => { timer = setTimeout(() => rej(new BusLimitError('timeout', `${r.id} timed out`)), c.answerTimeoutMs); }),
        ]);
        clearTimeout(timer);
        if (answer === null || answer === undefined) continue;     // declined
        const clipped = String(answer).slice(0, c.maxAnswerChars);
        this.#cache.set(h, clipped);
        return this.#record(from, msg.thread, msg.hop, msg.question, { answer: clipped, source: r.id });
      } catch (err) {
        clearTimeout(timer);
        this.emit('responder-error', { responder: r.id, error: err.message });
        // try the next responder
      }
    }
    throw new BusLimitError('unanswered', `no responder produced an answer for "${msg.question.slice(0, 60)}"`);
  }

  #record(from, thread, hop, question, res) {
    const entry = { t: Date.now(), from, thread, hop, question, ...res };
    this.#log.push(entry);
    this.emit('exchange', entry);
    return res;
  }

  stats() {
    return {
      responderCalls: this.#globalCalls,
      perAgent: Object.fromEntries(this.#perAgent),
      exchanges: this.#log.length,
      sources: this.#log.reduce((m, e) => { const k = e.source.split(':')[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
    };
  }

  transcript() { return [...this.#log]; }
}
