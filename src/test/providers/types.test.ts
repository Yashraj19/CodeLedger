import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseResponse, buildUserPrompt, fetchWithTimeout } from '../../providers/types';

describe('parseResponse', () => {
  it("returns null for 'SKIP'", () => {
    expect(parseResponse('SKIP')).toBeNull();
  });

  it("returns null for 'skip' (case-insensitive)", () => {
    expect(parseResponse('skip')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseResponse('')).toBeNull();
  });

  it('returns trimmed question for a real question', () => {
    expect(parseResponse('  Why did you use a Map here?  ')).toBe('Why did you use a Map here?');
  });
});

describe('buildUserPrompt', () => {
  it('contains filename and diffText in output', () => {
    const result = buildUserPrompt('foo.ts', '+ added line');
    expect(result).toContain('foo.ts');
    expect(result).toContain('+ added line');
  });
});

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls fetch with AbortSignal', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://example.com', { method: 'GET' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(opts.signal).toBeDefined();
  });

  it('aborts and throws after timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockImplementation(
      (_url, opts) =>
        new Promise((_, reject) => {
          (opts?.signal as AbortSignal)?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );

    const promise = fetchWithTimeout('https://example.com', { method: 'GET' });
    vi.advanceTimersByTime(20000);

    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });
});
