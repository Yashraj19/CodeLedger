import { describe, it, expect, beforeEach } from 'vitest';
import { DiffTracker } from '../diffTracker';

function makeDoc(fsPath: string, text: string) {
  return {
    uri: { fsPath },
    getText: () => text,
  };
}

describe('DiffTracker', () => {
  let tracker: DiffTracker;

  beforeEach(() => {
    tracker = new DiffTracker();
  });

  it('initialize sets content only on first call', () => {
    const doc1 = makeDoc('/a.ts', 'line1');
    const doc2 = makeDoc('/a.ts', 'line2');
    tracker.initialize(doc1 as never);
    tracker.initialize(doc2 as never); // second call should be ignored
    const diff = tracker.computeDiff(makeDoc('/a.ts', 'line2') as never);
    // stored was 'line1', so 'line2' is added and 'line1' removed
    expect(diff.addedLines).toContain('line2');
    expect(diff.removedLines).toContain('line1');
  });

  it('computeDiff detects added lines', () => {
    const doc = makeDoc('/b.ts', 'original');
    tracker.initialize(doc as never);
    const diff = tracker.computeDiff(makeDoc('/b.ts', 'original\nnewLine') as never);
    expect(diff.addedLines).toContain('newLine');
    expect(diff.totalChanged).toBeGreaterThan(0);
  });

  it('computeDiff detects removed lines', () => {
    const doc = makeDoc('/c.ts', 'lineA\nlineB');
    tracker.initialize(doc as never);
    const diff = tracker.computeDiff(makeDoc('/c.ts', 'lineA') as never);
    expect(diff.removedLines).toContain('lineB');
  });

  it('computeDiff returns totalChanged = 0 for whitespace-only change', () => {
    const doc = makeDoc('/d.ts', 'const x = 1;');
    tracker.initialize(doc as never);
    // Only whitespace added — trimmed content is identical
    const diff = tracker.computeDiff(makeDoc('/d.ts', 'const x = 1;  ') as never);
    expect(diff.totalChanged).toBe(0);
  });

  it('computeDiff updates stored content after call', () => {
    const doc = makeDoc('/e.ts', 'v1');
    tracker.initialize(doc as never);
    tracker.computeDiff(makeDoc('/e.ts', 'v2') as never);
    // Now stored is 'v2'; diff against 'v3' should show v2->v3 change
    const diff2 = tracker.computeDiff(makeDoc('/e.ts', 'v3') as never);
    expect(diff2.addedLines).toContain('v3');
    expect(diff2.removedLines).toContain('v2');
  });

  it('clearFile removes tracked state', () => {
    const doc = makeDoc('/f.ts', 'content');
    tracker.initialize(doc as never);
    tracker.clearFile('/f.ts');
    // After clear, computeDiff treats old content as empty
    const diff = tracker.computeDiff(makeDoc('/f.ts', 'newContent') as never);
    expect(diff.addedLines).toContain('newContent');
    expect(diff.removedLines).toHaveLength(0);
  });
});
