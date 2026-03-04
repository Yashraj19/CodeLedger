import {
  LLMProvider,
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseResponse,
  fetchWithTimeout,
} from './types';
import { GeminiResponse } from './apiTypes';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiProvider implements LLMProvider {
  readonly name = 'Gemini';

  constructor(
    private apiKey: string,
    private model: string = 'gemini-flash-latest'
  ) {}

  async generateQuestion(filename: string, diffText: string): Promise<string | null> {
    const url = `${BASE_URL}/${this.model}:generateContent`;

    const body = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: buildUserPrompt(filename, diffText) }] }],
    };

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }

    const json = await res.json() as GeminiResponse;
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseResponse(text);
  }
}
