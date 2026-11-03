import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original, NODE_ENV: 'production' };
    delete process.env.AUTH_DEV_AUTO_VERIFY;
    delete process.env.ALLOW_DEV_TENANT_HEADER;
  });
  afterAll(() => { process.env = original; });

  it('requires an explicit recognized runtime environment', () => {
    process.env.NODE_ENV = '';
    expect(() => validateEnvironment()).toThrow('NODE_ENV must be explicitly set');
    process.env.NODE_ENV = 'preview';
    expect(() => validateEnvironment()).toThrow('NODE_ENV must be explicitly set');
  });

  it('rejects missing production configuration', () => {
    expect(() => validateEnvironment()).toThrow('Missing required production configuration');
  });

  it.each(['AUTH_DEV_AUTO_VERIFY', 'ALLOW_DEV_TENANT_HEADER'])('rejects the development-only %s flag in production', (flag) => {
    process.env[flag] = 'true';
    expect(() => validateEnvironment()).toThrow(`[SECURITY] ${flag} cannot be enabled in production`);
  });

  it('accepts complete HTTPS production configuration', () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://user:password@db.example.com:5432/fitness',
      FRAPPE_BASE_URL: 'https://erp.example.com', FRAPPE_API_KEY: 'key', FRAPPE_API_SECRET: 'secret',
      FRAPPE_EXPECTED_APP_VERSION: '0.0.1',
      JWT_SECRET: 'a'.repeat(32), OTP_HASH_SECRET: 'd'.repeat(32), FRAPPE_CALLBACK_SECRET: 'b'.repeat(32), RAZORPAY_WEBHOOK_SECRET: 'c'.repeat(32),
      CORS_ALLOWED_ORIGINS: 'https://app.example.com', TENANT_BASE_DOMAIN: 'fitness.example.com', TRUST_PROXY_HOPS: '1',
    });
    expect(validateEnvironment()).toBe(process.env);
  });

  it('requires an explicit valid trusted proxy hop count in production', () => {
    Object.assign(process.env, {
      DATABASE_URL: 'postgresql://user:password@db.example.com:5432/fitness',
      FRAPPE_BASE_URL: 'https://erp.example.com', FRAPPE_API_KEY: 'key', FRAPPE_API_SECRET: 'secret',
      FRAPPE_EXPECTED_APP_VERSION: '0.0.1',
      JWT_SECRET: 'a'.repeat(32), OTP_HASH_SECRET: 'd'.repeat(32), FRAPPE_CALLBACK_SECRET: 'b'.repeat(32), RAZORPAY_WEBHOOK_SECRET: 'c'.repeat(32),
      CORS_ALLOWED_ORIGINS: 'https://app.example.com', TENANT_BASE_DOMAIN: 'fitness.example.com', TRUST_PROXY_HOPS: 'one',
    });
    expect(() => validateEnvironment()).toThrow('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  });
});
