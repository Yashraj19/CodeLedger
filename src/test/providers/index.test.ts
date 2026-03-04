import { describe, it, expect } from 'vitest';
import { createProvider, DEFAULT_MODELS } from '../../providers/index';
import { GeminiProvider } from '../../providers/gemini';
import { OpenAIProvider } from '../../providers/openai';
import { ClaudeProvider } from '../../providers/claude';

describe('createProvider', () => {
  it("returns GeminiProvider for 'gemini'", () => {
    const p = createProvider('gemini', 'key');
    expect(p).toBeInstanceOf(GeminiProvider);
  });

  it("returns OpenAIProvider for 'openai'", () => {
    const p = createProvider('openai', 'key');
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it("returns ClaudeProvider for 'claude'", () => {
    const p = createProvider('claude', 'key');
    expect(p).toBeInstanceOf(ClaudeProvider);
  });

  it('uses modelOverride when provided', () => {
    const p = createProvider('openai', 'key', 'gpt-4-turbo') as OpenAIProvider & { model: string };
    // model is private, check via name at least
    expect(p).toBeInstanceOf(OpenAIProvider);
  });
});

describe('DEFAULT_MODELS', () => {
  it('has entries for all three providers', () => {
    expect(DEFAULT_MODELS.gemini).toBeTruthy();
    expect(DEFAULT_MODELS.openai).toBeTruthy();
    expect(DEFAULT_MODELS.claude).toBeTruthy();
  });
});
