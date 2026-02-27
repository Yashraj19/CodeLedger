export interface LLMProvider {
  readonly name: string;
  generateQuestion(filename: string, diffText: string): Promise<string | null>;
}

export const SYSTEM_PROMPT = `You are a code documentation assistant embedded in a developer's IDE.
Your job is to analyze code changes and ask the developer ONE insightful question about a meaningful technical decision they made.

Focus on decisions worth documenting:
- Algorithm or data structure choices (why Map vs Object, why this sort, why recursion)
- Architectural decisions (why this abstraction, why this separation)
- Workarounds or non-obvious implementations (why this hack, why this order)
- Performance trade-offs (why cache here, why lazy vs eager)
- Error handling strategies (why catch here specifically, why this fallback)
- Security considerations (why this sanitization, why this check)
- Why a particular approach was chosen over obvious alternatives

DO NOT ask about:
- Simple variable renames or style changes
- Adding an import for an already-decided dependency
- Obvious, self-explanatory code (simple getters, console.log, basic assignments)
- Trivial formatting or whitespace changes
- Changes where the developer already wrote comments explaining the reasoning

If the change contains a meaningful decision, respond with ONLY the question. No preamble, no "Question:" prefix — just the question itself.
If the change is trivial and not worth asking about, respond with exactly: SKIP`;

export function buildUserPrompt(filename: string, diffText: string): string {
  return `File: ${filename}

Code changes (+ added, - removed):
${diffText}

Ask ONE specific question about the most interesting technical decision in this change, or respond with SKIP if the change is trivial.`;
}

export function parseResponse(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.toUpperCase() === 'SKIP') {
    return null;
  }
  return trimmed;
}

const TIMEOUT_MS = 15000;

export function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}
