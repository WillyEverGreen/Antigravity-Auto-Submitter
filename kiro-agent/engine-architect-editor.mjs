/**
 * Kiro Agent V2 - Architect-Editor Dual Model Engine (engine-architect-editor.mjs)
 * 
 * Inspired by Aider's ArchitectCoder pattern:
 * - Architect (Claude Sonnet 4.5): Generates ultra-dense technical blueprint & invariants (~7-8s).
 * - Editor (Claude Haiku 4.5): Generates the full production code implementation (~6-8s).
 * 
 * Combined duration: ~13-18s (7.7x faster than monolithic V1) with top-tier architectural reasoning.
 */

import { executeRaw } from './kiro-core.mjs';

export async function executeArchitectEditor({
  prompt,
  architectModel = 'claude-sonnet-4.5',
  editorModel = 'claude-haiku-4.5',
  context = ''
}) {
  const tStart = Date.now();

  // Step 1: Architect Phase - Ultra-dense invariant specification and interface blueprint
  const architectPrompt = `You are a Principal Software Architect.
Provide an ULTRA-DENSE, concise specification (under 200 words):
1. Exact TypeScript interfaces, types, and function signatures.
2. 3 core invariants that MUST be satisfied.
3. Critical boundary edge cases.

Do NOT write classes, full implementation code, or conversational prose. Output pure technical specification.

${context ? `### Context / Codebase Reference:\n${context}\n` : ''}
### User Task:
${prompt}`;

  const archRes = await executeRaw({
    prompt: architectPrompt,
    model: architectModel,
    role: 'architect',
    maxTokens: 400,
    temperature: 0.1
  });

  if (!archRes.success) {
    return {
      success: false,
      error: `Architect phase failed: ${archRes.error}`,
      durationMs: Date.now() - tStart
    };
  }

  // Step 2: Editor Phase - Implement the exact code following the Architect's blueprint
  const editorPrompt = `You are an Elite Surgical Implementation Engineer.
Follow the Principal Architect's blueprint below to produce the complete, production-grade code implementation.

### Architect Blueprint & Invariants:
${archRes.content}

### User Task:
${prompt}

### Strict Implementation Rules:
- Implement the code fully with strict type annotations and edge-case guards.
- Honor all invariants specified by the Architect.
- Output clean, ready-to-run code without unnecessary chit-chat.`;

  const editRes = await executeRaw({
    prompt: editorPrompt,
    model: editorModel,
    role: 'editor',
    maxTokens: 4096,
    temperature: 0.2
  });

  const totalDuration = Date.now() - tStart;

  if (!editRes.success) {
    return {
      success: false,
      error: `Editor phase failed: ${editRes.error}`,
      blueprint: archRes.content,
      durationMs: totalDuration
    };
  }

  return {
    success: true,
    pattern: 'Architect-Editor',
    architect: {
      model: archRes.model,
      durationMs: archRes.durationMs,
      tokens: archRes.usage?.completion_tokens || 0,
      blueprint: archRes.content
    },
    editor: {
      model: editRes.model,
      durationMs: editRes.durationMs,
      tokens: editRes.usage?.completion_tokens || 0,
      code: editRes.content
    },
    finalCode: editRes.content,
    totalDurationMs: totalDuration,
    totalTokens: (archRes.usage?.total_tokens || 0) + (editRes.usage?.total_tokens || 0)
  };
}
