import { jest } from '@jest/globals';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

describe('SecurityHeadersMiddleware', () => {
  it('adds API security headers', () => {
    const response = { setHeader: jest.fn() } as any;
    const next = jest.fn();
    new SecurityHeadersMiddleware().use({} as any, response, next);
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
