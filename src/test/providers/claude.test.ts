import { describe, it, expect, vi, afterEach } from 'vitest';
import { ClaudeProvider } from '../../providers/claude';

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ClaudeProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed question on 200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'Why did you use a Map?' }] })
    );
    const provider = new ClaudeProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBe('Why did you use a Map?');
  });

  it('returns null when LLM responds with SKIP', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'SKIP' }] })
    );
    const provider = new ClaudeProvider('key');
    const result = await provider.generateQuestion('foo.ts', '+ line');
    expect(result).toBeNull();
  });

  it('throws on non-200 response with status code in message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 })
    );
    const provider = new ClaudeProvider('bad-key');
    await expect(provider.generateQuestion('foo.ts', '+ line')).rejects.toThrow('401');
  });

  it('uses correct anthropic-version header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'SKIP' }] })
    );
    const provider = new ClaudeProvider('key');
    await provider.generateQuestion('foo.ts', '+ line');
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('uses x-api-key header (not Authorization)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      makeResponse({ content: [{ type: 'text', text: 'SKIP' }] })
    );
    const provider = new ClaudeProvider('my-key');
    await provider.generateQuestion('foo.ts', '+ line');
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('my-key');
    expect(headers['Authorization']).toBeUndefined();
  });
});
