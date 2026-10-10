/**
 * Kiro Agent V2 - Semantic Router Engine (engine-semantic-router.mjs)
 *
 * Classifies task intent with high precision to route to the optimal
 * execution strategy and model. Replaces naive keyword matching with
 * multi-dimensional signal scoring across 8 task dimensions:
 *
 *   1. Complexity    - lines of logic, nesting depth signals
 *   2. Risk          - security / auth / crypto / money signals
 *   3. Speed         - user wants instant turnaround
 *   4. Reasoning     - math / proof / algorithm / derivation
 *   5. Consensus     - user wants multi-model comparison
 *   6. Refactor      - reorganise / clean up existing code
 *   7. Debug         - fix / trace / root-cause existing bug
 *   8. Docs          - explain / document / summarize
 *
 * Routing output: { mode, model, reason, scores }
 */

// ─── Signal tables ────────────────────────────────────────────────────────────

const SIGNALS = {
  complexity: [
    /\b(feature|implement|build|create|generate|design|architect(ure)?|complex(ity)?|scaffold|system|service|module|api|sdk|library|framework|pipeline|workflow|engine)\b/i,
    /\b(multi.?file|full.?stack|end.?to.?end|end2end|production.?grade|complete|entire|whole|comprehensive)\b/i,
    /\b(class|interface|abstract|inherit|polymorphi|generic|template|decorator|middleware|plugin|hook)\b/i,
  ],
  risk: [
    /\b(auth(entication|oriz|or)?|oauth|jwt|session|csrf|xss|sql.?inj|rce|lfi|rfi|privilege|escalat|zero.?day|cve|vuln|exploit)\b/i,
    /\b(encrypt|decrypt|cipher|hash|hmac|secret|private.?key|certificate|tls|ssl|pem|rsa|aes|pbkdf)\b/i,
    /\b(payment|stripe|billing|transaction|financial|money|bank|pci|gdpr|compliance|audit)\b/i,
    /\b(critical|high.?stakes|production|incident|outage|emergency|urgent.?fix|hotfix)\b/i,
  ],
  speed: [
    /\b(quick|fast|instant|asap|brief|tiny|simple|short|one.?liner|snippet|example|demo|test)\b/i,
    /\b(hello.?world|boilerplate|stub|skeleton|template|placeholder)\b/i,
  ],
  reasoning: [
    /\b(math|mathemati|algorithm|invariant|proof|derive|formal|logic|theorem|lemma|O\(|complexity|big.?O|amortiz)\b/i,
    /\b(dynamic.?programm|recursion|memoiz|backtrack|graph.?travers|shortest.?path|dijkstra|bellman)\b/i,
    /\b(concurren|race.?condition|deadlock|mutex|semaphore|atomic|lock.?free|wait.?free|memory.?model)\b/i,
  ],
  consensus: [
    /\b(council|consensus|swarm|compare|evaluate|best.?approach|which.?is.?better|alternative|tradeoff|pros.?and.?cons|review.?options)\b/i,
    /\b(all.?models|multi.?model|second.?opinion|peer.?review|ensemble|vote)\b/i,
  ],
  refactor: [
    /\b(refactor|restructure|reorganize|clean.?up|modernize|migrate|convert|rewrite|replace|rename.?all)\b/i,
    /\b(dedup|dry|solid|srp|extract|isolate|decouple|modularize)\b/i,
  ],
  debug: [
    /\b(bug|fix|broken|error|exception|crash|fail|undefined|null.?pointer|segfault|stack.?overflow|infinite.?loop)\b/i,
    /\b(debug|trace|root.?cause|why.?is|what.?causes|investigate|diagnose|reproduce)\b/i,
  ],
  docs: [
    /\b(explain|document|summarize|describe|what.?is|how.?does|overview|readme|jsdoc|comment|annotate)\b/i,
    /\b(write.?docs|add.?comments|generate.?readme|api.?docs)\b/i,
  ],
};

export const MODELS = {
  sonnet: 'claude-sonnet-4.5',
  haiku: 'claude-haiku-4.5',
  deepseek: 'deepseek-3.2',
  qwen: 'qwen3-coder-next',
  minimax: 'minimax-m2.5',
};

/**
 * Score a prompt across all signal dimensions.
 * @param {string} prompt
 * @returns {{ [dimension: string]: number }}  0-100 per dimension
 */
export function scorePrompt(prompt) {
  const scores = {};
  for (const [dim, patterns] of Object.entries(SIGNALS)) {
    let hits = 0;
    for (const pat of patterns) {
      // Use global flag to count actual word-level matches (not capture group count).
      // We rebuild with 'gi' so m.length == actual number of distinct occurrences.
      const globalPat = new RegExp(pat.source, 'gi');
      const m = prompt.match(globalPat);
      if (m) hits += 1; // count 1 per pattern that fires (not raw match count)
    }
    scores[dim] = Math.min(100, Math.round((hits / patterns.length) * 100));
  }
  if (prompt.length > 600)  scores.complexity = Math.min(100, scores.complexity + 20);
  if (prompt.length > 1200) scores.complexity = Math.min(100, scores.complexity + 20);
  return scores;
}

/**
 * Analyse the prompt and return routing decision.
 * @param {string} prompt
 * @param {string} [forcedMode]
 * @returns {{ mode: string, model: string, reason: string, scores: object }}
 */
export function semanticRoute(prompt, forcedMode = null) {
  if (forcedMode && forcedMode !== 'auto') {
    return { mode: forcedMode, model: MODELS.sonnet, reason: 'User-forced mode', scores: {} };
  }

  const scores = scorePrompt(prompt);

  if (scores.risk >= 30) {
    return { mode: 'council', model: MODELS.sonnet,
      reason: `Risk score ${scores.risk} — high-stakes domain, consensus required`, scores };
  }
  if (scores.consensus >= 25) {
    return { mode: 'council', model: MODELS.sonnet,
      reason: `Consensus score ${scores.consensus} — multi-model comparison requested`, scores };
  }
  if (scores.reasoning >= 20) {
    return { mode: 'logic', model: MODELS.deepseek,
      reason: `Reasoning score ${scores.reasoning} — algorithmic/mathematical task`, scores };
  }
  if (scores.debug >= 25 && scores.complexity >= 20) {
    return { mode: 'architect-editor', model: MODELS.sonnet,
      reason: `Debug ${scores.debug} + Complexity ${scores.complexity} — structured debugging`, scores };
  }
  if (scores.debug >= 20) {
    return { mode: 'logic', model: MODELS.deepseek,
      reason: `Debug score ${scores.debug} — root-cause via DeepSeek`, scores };
  }
  if (scores.complexity >= 20 || scores.refactor >= 25) {
    return { mode: 'architect-editor', model: MODELS.sonnet,
      reason: `Complexity ${scores.complexity} / Refactor ${scores.refactor} — architect-editor pipeline`, scores };
  }
  if (scores.docs >= 25 || scores.speed >= 30) {
    return { mode: 'fast', model: MODELS.haiku,
      reason: `Docs ${scores.docs} / Speed ${scores.speed} — fast tier`, scores };
  }
  if (prompt.length < 120) {
    return { mode: 'fast', model: MODELS.haiku,
      reason: 'Short prompt — fast tier default', scores };
  }
  return { mode: 'architect-editor', model: MODELS.sonnet,
    reason: 'Default: architect-editor for general tasks', scores };
}

export default { semanticRoute, scorePrompt, MODELS };
