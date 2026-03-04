import {
  LLMProvider,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseResponse,
  fetchWithTimeout,
} from './types';
import { OpenAIResponse } from './apiTypes';

const BASE_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'OpenAI';

  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini'
  ) {}

  async generateQuestion(filename: string, diffText: string): Promise<string | null> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(filename, diffText) },
      ],
      temperature: 0.3,
      max_tokens: 200,
    };

    const res = await fetchWithTimeout(BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI API error (${res.status}): ${err}`);
    }

    const json = await res.json() as OpenAIResponse;
    const text: string = json?.choices?.[0]?.message?.content ?? '';
    return parseResponse(text);
  }
}
