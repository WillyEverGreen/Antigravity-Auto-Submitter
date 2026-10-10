/**
 * Kiro Agent V2 - Verification & Self-Healing Engine (engine-verifier.mjs)
 * 
 * Inspects generated code for AST/syntax validity before handing it to Antigravity.
 * If a syntax error, unbalanced token, or invalid structure is detected, it automatically
 * executes a 1-turn fast self-healing correction loop.
 */

import vm from 'node:vm';
import { executeRaw } from './kiro-core.mjs';

/**
 * Extract code blocks from markdown output
 */
export function extractCodeBlocks(text) {
  const codeBlockRegex = /```(?:[a-zA-Z0-9_\-]+)?\s*([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    blocks.push(match[1]);
  }
  return blocks.length > 0 ? blocks : [text];
}

/**
 * Validate JavaScript / TypeScript / JSON syntax
 */
export function validateCodeSyntax(code, languageHint = 'javascript') {
  const trimmed = code.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return { valid: true, type: 'json' };
    } catch {
      // not JSON
    }
  }

  // Token balance check (brackets, braces, parentheses)
  const stack = [];
  const pairs = { '(': ')', '{': '}', '[': ']' };
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1];

    if (!inString && char === '/' && nextChar === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
      continue;
    } else if (inString && char === stringChar && code[i - 1] !== '\\') {
      inString = false;
      continue;
    }

    if (!inString) {
      if (pairs[char]) {
        stack.push({ char, index: i });
      } else if (Object.values(pairs).includes(char)) {
        if (stack.length === 0) {
          return { valid: false, error: `Unmatched closing bracket '${char}' at index ${i}` };
        }
        const last = stack.pop();
        if (pairs[last.char] !== char) {
          return { valid: false, error: `Mismatched bracket '${last.char}' closed with '${char}' at index ${i}` };
        }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.pop();
    return { valid: false, error: `Unclosed bracket '${unclosed.char}' at index ${unclosed.index}` };
  }

  if (languageHint === 'javascript' || languageHint === 'js') {
    try {
      new vm.Script(code, { displayErrors: true });
      return { valid: true, type: 'javascript' };
    } catch (err) {
      const isTS = /\b(interface|type|public|private|protected|readonly|implements|as\s+[A-Z])\b/.test(code);
      if (!isTS) {
        return { valid: false, error: `JavaScript SyntaxError: ${err.message}` };
      }
    }
  }

  return { valid: true, type: 'checked' };
}

/**
 * Verify and Self-Heal Code
 */
export async function verifyAndSelfHeal({
  code,
  taskPrompt = '',
  repairModel = 'claude-haiku-4.5'
}) {
  const blocks = extractCodeBlocks(code);
  let mainCode = blocks[0] || code;

  const check = validateCodeSyntax(mainCode);
  if (check.valid) {
    return {
      healed: false,
      valid: true,
      code
    };
  }

  // Trigger automated 1-turn repair loop
  const repairPrompt = `A syntax verification gate detected a structural error in this generated code:
Error: ${check.error}

Original Task:
${taskPrompt}

Defective Code:
\`\`\`
${mainCode}
\`\`\`

Fix the syntax error immediately. Output ONLY the corrected, ready-to-run code inside a code block.`;

  const repairRes = await executeRaw({
    prompt: repairPrompt,
    model: repairModel,
    role: 'editor',
    maxTokens: 3000,
    temperature: 0.1
  });

  if (repairRes.success) {
    return {
      healed: true,
      valid: true,
      originalError: check.error,
      code: repairRes.content
    };
  }

  return {
    healed: false,
    valid: false,
    originalError: check.error,
    code
  };
}
