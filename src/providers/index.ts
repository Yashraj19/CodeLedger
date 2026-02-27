import { LLMProvider } from './types';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';

export type ProviderName = 'gemini' | 'openai' | 'claude';

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  claude: 'Anthropic Claude',
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-flash-latest',
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
};

export function createProvider(
  name: ProviderName,
  apiKey: string,
  modelOverride?: string
): LLMProvider {
  const model = modelOverride || DEFAULT_MODELS[name];

  switch (name) {
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'claude':
      return new ClaudeProvider(apiKey, model);
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

export { LLMProvider } from './types';
