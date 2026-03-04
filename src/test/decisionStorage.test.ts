import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs');

import * as fs from 'fs';
import { DecisionStorage } from '../decisionStorage';

const WORKSPACE = '/workspace';
const FOLDER = '.codeledger';

function makeStorage() {
  return new DecisionStorage(WORKSPACE, FOLDER);
}

describe('DecisionStorage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('saveDecision', () => {
    it('throws on empty question', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const storage = makeStorage();
      expect(() => storage.saveDecision('/workspace/foo.ts', '', 'answer', '')).toThrow(
        'question must not be empty'
      );
    });

    it('throws on empty answer', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const storage = makeStorage();
      expect(() => storage.saveDecision('/workspace/foo.ts', 'Why?', '', '')).toThrow(
        'answer must not be empty'
      );
    });

    it('creates storage file with correct structure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const storage = makeStorage();
      const decision = storage.saveDecision('/workspace/foo.ts', 'Why?', 'Because.', 'code');

      expect(decision.question).toBe('Why?');
      expect(decision.answer).toBe('Because.');
      expect(decision.filePath).toBe('foo.ts');
      expect(decision.id).toBeTruthy();

      // writeFileSync called twice: once for README, once for decision JSON
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      const [jsonPath, jsonContent] = vi.mocked(fs.writeFileSync).mock.calls[1] as [string, string];
      expect(jsonPath).toContain('.json');
      const parsed = JSON.parse(jsonContent);
      expect(parsed.decisions).toHaveLength(1);
      expect(parsed.decisions[0].question).toBe('Why?');
    });

    it('appends to existing file', () => {
      const existing = {
        file: 'foo.ts',
        decisions: [
          { id: '1', timestamp: '', filePath: 'foo.ts', codeSnippet: '', question: 'Q1', answer: 'A1' },
        ],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing) as never);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const storage = makeStorage();
      storage.saveDecision('/workspace/foo.ts', 'Q2', 'A2', '');

      const [, jsonContent] = vi.mocked(fs.writeFileSync).mock.calls[0] as [string, string];
      const parsed = JSON.parse(jsonContent);
      expect(parsed.decisions).toHaveLength(2);
      expect(parsed.decisions[1].question).toBe('Q2');
    });

    it('throws on write failure', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('disk full');
      });

      const storage = makeStorage();
      expect(() => storage.saveDecision('/workspace/foo.ts', 'Q', 'A', '')).toThrow(
        'Failed to save decision: disk full'
      );
    });
  });

  describe('getDecisions', () => {
    it('returns [] for unknown file', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const storage = makeStorage();
      expect(storage.getDecisions('/workspace/unknown.ts')).toEqual([]);
    });

    it('returns parsed decisions for known file', () => {
      const data = {
        file: 'foo.ts',
        decisions: [{ id: '1', timestamp: '', filePath: 'foo.ts', codeSnippet: '', question: 'Q', answer: 'A' }],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data) as never);
      const storage = makeStorage();
      const decisions = storage.getDecisions('/workspace/foo.ts');
      expect(decisions).toHaveLength(1);
      expect(decisions[0].question).toBe('Q');
    });
  });

  describe('getAllDecisions', () => {
    it('returns [] if folder does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const storage = makeStorage();
      expect(storage.getAllDecisions()).toEqual([]);
    });

    it('returns all non-empty entries', () => {
      const data = {
        file: 'bar.ts',
        decisions: [{ id: '2', timestamp: '', filePath: 'bar.ts', codeSnippet: '', question: 'Q', answer: 'A' }],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['bar.ts.json'] as never);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data) as never);
      const storage = makeStorage();
      const all = storage.getAllDecisions();
      expect(all).toHaveLength(1);
      expect(all[0].filePath).toBe('bar.ts');
    });
  });
});
