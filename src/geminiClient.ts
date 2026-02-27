import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are a code documentation assistant embedded in a developer's IDE.
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

If the change contains a meaningful decision, respond with ONLY the question. No preamble, no "Question:" prefix — just the question itself.
If the change is trivial and not worth asking about, respond with exactly: SKIP`;

export class GeminiClient {
  private genAI: GoogleGenerativeAI | null = null;

  initialize(apiKey: string): void {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  isInitialized(): boolean {
    return this.genAI !== null;
  }

  async generateQuestion(filename: string, diffText: string): Promise<string | null> {
    if (!this.genAI) {
      return null;
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    const prompt = `File: ${filename}

Code changes (+ added, - removed):
${diffText}

Ask ONE specific question about the most interesting technical decision in this change, or respond with SKIP if the change is trivial.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      if (text.toUpperCase() === 'SKIP' || text === '') {
        return null;
      }

      return text;
    } catch (error) {
      console.error('CodeLedger: Gemini API error:', error);
      return null;
    }
  }
}
