import {
  LLMProvider,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseResponse,
  fetchWithTimeout,
} from './types';

const BASE_URL = 'https://api.anthropic.com/v1/messages';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'Claude';

  constructor(
    private apiKey: string,
    private model: string = 'claude-haiku-4-5-20251001'
  ) {}

  async generateQuestion(filename: string, diffText: string): Promise<string | null> {
    const body = {
      model: this.model,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: buildUserPrompt(filename, diffText) },
      ],
    };

    const res = await fetchWithTimeout(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Claude API error (${res.status}): ${err}`);
    }

    const json: any = await res.json();
    const text: string = json?.content?.[0]?.text ?? '';
    return parseResponse(text);
  }
}
