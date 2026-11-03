/**
 * Converts an API error response to a displayable string.
 * - string -> itself
 * - object with .message or .error.message -> that message
 * - object with .error -> that error
 * - otherwise -> generic message
 */
export function toErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string' && err.message) return err.message;
    if (typeof err.error === 'string' && err.error) return err.error;
    if (err.error && typeof err.error === 'object' && err.error !== null) {
      const nested = err.error as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message) return nested.message;
      if (typeof nested.error === 'string' && nested.error) return nested.error;
    }
    if (typeof err.code === 'string' && err.code) return err.code;
  }
  return 'An unexpected error occurred';
}