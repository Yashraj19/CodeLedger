import { describe, it, expect, vi, afterEach } from 'vitest';
import { GeminiProvider } from '../../providers/gemini';

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

describe('GeminiProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed question on 200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse(geminiBody('Why did you choose this approach?'))
    );
    const provider = new GeminiProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBe('Why did you choose this approach?');
  });

  it('returns null when content text is SKIP', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(makeResponse(geminiBody('SKIP')));
    const provider = new GeminiProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBeNull();
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 })
    );
    const provider = new GeminiProvider('key');
    await expect(provider.generateQuestion('foo.ts', '+ line')).rejects.toThrow('403');
  });

  it('API key is in URL query param, not in Authorization header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse(geminiBody('SKIP'))
    );
    const provider = new GeminiProvider('my-secret-key');
    await provider.generateQuestion('foo.ts', '+ line');
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('key=my-secret-key');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});
