/**
 * Kiro Agent V2 - LLM Council Engine (engine-council.mjs)
 * 
 * Inspired by Andrej Karpathy's LLM Council and kyegomez/swarms:
 * 1. Dispatch query concurrently to 4 frontier models.
 * 2. Anonymize all responses (Candidate A, B, C, D).
 * 3. Conduct blind peer review & ranking across Security, Logic, and Efficiency.
 * 4. Chairman synthesizes the top-ranked elements into an authoritative solution.
 */

import { executeRaw } from './kiro-core.mjs';

export async function executeCouncil({
  prompt,
  councilModels = ['claude-sonnet-4.5', 'deepseek-3.2', 'qwen3-coder-next', 'minimax-m2.5'],
  chairmanModel = 'claude-sonnet-4.5',
  context = ''
}) {
  const tStart = Date.now();

  // STAGE 1: Parallel Independent Proposals
  const proposalPromises = councilModels.map(async (model, idx) => {
    const rolePrompt = `You are Council Member #${idx + 1}. Independently provide the best, most robust, and highest-performing technical solution for the request below. Focus on strict correctness and edge cases.`;
    const fullPrompt = `${context ? `### Context:\n${context}\n` : ''}### Task:\n${prompt}`;
    
    const res = await executeRaw({
      prompt: fullPrompt,
      model,
      systemPrompt: rolePrompt,
      maxTokens: 3000,
      temperature: 0.2
    });

    return {
      model,
      candidateId: `Candidate ${String.fromCharCode(65 + idx)}`, // A, B, C, D
      success: res.success,
      content: res.content || `[Failed to respond: ${res.error}]`,
      durationMs: res.durationMs || 0
    };
  });

  const rawProposals = await Promise.all(proposalPromises);
  const validProposals = rawProposals.filter(p => p.success);

  if (validProposals.length === 0) {
    return {
      success: false,
      error: 'All council members failed to generate proposals.',
      durationMs: Date.now() - tStart
    };
  }

  // STAGE 2: Blind Peer Review & Ranking
  const anonymizedText = validProposals.map(p => (
    `==================== ${p.candidateId} ====================\n${p.content}\n`
  )).join('\n');

  const peerReviewPrompt = `You are an impartial Technical Judge conducting a blind peer review of the following anonymous candidate proposals.

### Anonymous Proposals:
${anonymizedText}

### Task Being Solved:
${prompt}

### Evaluation Instructions:
1. Score each Candidate (A, B, C, etc.) from 1 to 10 on:
   - Correctness & Edge-Case Handling (1-10)
   - Architectural Cleanliness (1-10)
   - Algorithmic Performance & Safety (1-10)
2. Identify the single biggest bug, risk, or flaw in each candidate.
3. Identify the standout strengths of the top candidate.
4. Output your ranking in order of best to worst.`;

  const [evaluatorA, evaluatorB] = await Promise.all([
    executeRaw({
      prompt: peerReviewPrompt,
      model: 'deepseek-3.2', // elite math/logic evaluator
      role: 'critic',
      maxTokens: 1500,
      temperature: 0.1
    }),
    executeRaw({
      prompt: peerReviewPrompt,
      model: 'claude-sonnet-4.5', // elite architecture evaluator
      role: 'critic',
      maxTokens: 1500,
      temperature: 0.1
    })
  ]);

  // STAGE 3: Chairman Synthesis
  const synthesisPrompt = `You are the Chairman of the LLM Technical Council.
Synthesize the definitive, production-grade final implementation based on the council's proposals and blind peer evaluations.

### Original Task:
${prompt}

### Candidate Proposals:
${anonymizedText}

### Peer Evaluation A (DeepSeek Logic Audit):
${evaluatorA.content || 'N/A'}

### Peer Evaluation B (Sonnet Architecture Audit):
${evaluatorB.content || 'N/A'}

### Chairman Synthesis Directive:
1. Incorporate the strongest algorithmic insights and eliminate any flaws identified during peer review.
2. Produce the complete, gold-standard, production-ready code implementation.
3. Provide a brief summary of the council's consensus.`;

  const chairmanRes = await executeRaw({
    prompt: synthesisPrompt,
    model: chairmanModel,
    role: 'judge',
    maxTokens: 4096,
    temperature: 0.15
  });

  const totalDuration = Date.now() - tStart;

  return {
    success: chairmanRes.success,
    pattern: 'LLM Council (Karpathy/Swarms)',
    totalDurationMs: totalDuration,
    candidateCount: validProposals.length,
    candidates: validProposals.map(p => ({
      candidateId: p.candidateId,
      model: p.model,
      durationMs: p.durationMs,
      preview: p.content.slice(0, 300) + '...'
    })),
    peerReviews: {
      logicAudit: evaluatorA.content,
      architectureAudit: evaluatorB.content
    },
    finalSolution: chairmanRes.content,
    error: chairmanRes.error
  };
}
