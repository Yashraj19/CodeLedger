import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIProvider } from '../../providers/openai';

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function openaiBody(content: string) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

describe('OpenAIProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed question on 200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse(openaiBody('Why did you pick gpt-4o-mini?'))
    );
    const provider = new OpenAIProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBe('Why did you pick gpt-4o-mini?');
  });

  it('returns null when content is SKIP', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(makeResponse(openaiBody('SKIP')));
    const provider = new OpenAIProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBeNull();
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 })
    );
    const provider = new OpenAIProvider('key');
    await expect(provider.generateQuestion('foo.ts', '+ line')).rejects.toThrow('400');
  });

  it('uses Bearer auth header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse(openaiBody('SKIP'))
    );
    const provider = new OpenAIProvider('my-openai-key');
    await provider.generateQuestion('foo.ts', '+ line');
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-openai-key');
  });
});
