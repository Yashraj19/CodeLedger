import { describe, it, expect } from 'vitest';
import { toErrorMessage } from '../utils';

describe('toErrorMessage', () => {
  it('returns message for Error instances', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies plain strings', () => {
    expect(toErrorMessage('plain string')).toBe('plain string');
  });

  it('stringifies null', () => {
    expect(toErrorMessage(null)).toBe('null');
  });

  it('stringifies numbers', () => {
    expect(toErrorMessage(42)).toBe('42');
  });
});
