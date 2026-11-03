import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toErrorMessage } from './error-utils';

describe('toErrorMessage', () => {
  it('returns string as-is', () => {
    assert.strictEqual(toErrorMessage('simple error'), 'simple error');
  });

  it('returns generic message for empty string', () => {
    assert.strictEqual(toErrorMessage(''), 'An unexpected error occurred');
  });

  it('extracts message from object with .message', () => {
    assert.strictEqual(toErrorMessage({ message: 'API error' }), 'API error');
  });

  it('extracts error from object with .error string', () => {
    assert.strictEqual(toErrorMessage({ error: 'API error' }), 'API error');
  });

  it('extracts nested error.message', () => {
    assert.strictEqual(toErrorMessage({ error: { message: 'Nested error' } }), 'Nested error');
  });

  it('extracts nested error.error string', () => {
    assert.strictEqual(toErrorMessage({ error: { error: 'Nested error' } }), 'Nested error');
  });

  it('extracts code when no message', () => {
    assert.strictEqual(toErrorMessage({ code: 'RATE_LIMITED' }), 'RATE_LIMITED');
  });

  it('returns generic message for null/undefined', () => {
    assert.strictEqual(toErrorMessage(null), 'An unexpected error occurred');
    assert.strictEqual(toErrorMessage(undefined), 'An unexpected error occurred');
  });

  it('returns generic message for empty object', () => {
    assert.strictEqual(toErrorMessage({}), 'An unexpected error occurred');
  });

  it('handles object with no recognizable fields', () => {
    assert.strictEqual(toErrorMessage({ foo: 'bar' }), 'An unexpected error occurred');
  });
});