const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'FRAPPE_BASE_URL',
  'FRAPPE_API_KEY',
  'FRAPPE_API_SECRET',
  'FRAPPE_EXPECTED_APP_VERSION',
  'JWT_SECRET',
  'OTP_HASH_SECRET',
  'FRAPPE_CALLBACK_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'CORS_ALLOWED_ORIGINS',
  'TENANT_BASE_DOMAIN',
  'TRUST_PROXY_HOPS',
] as const;

function isHttpsUrl(value: string | undefined): boolean {
  try { return Boolean(value) && new URL(value as string).protocol === 'https:'; } catch { return false; }
}

export const validateEnvironment = () => {
  const environment = process.env.NODE_ENV;
  if (!environment || !['development', 'test', 'production'].includes(environment)) {
    throw new Error('NODE_ENV must be explicitly set to development, test, or production');
  }
  if (environment !== 'production') return process.env;
  for (const flag of ['AUTH_DEV_AUTO_VERIFY', 'ALLOW_DEV_TENANT_HEADER'] as const) {
    const value = process.env[flag]?.trim().toLowerCase();
    if (value && value !== 'false' && value !== '0') {
      throw new Error(`[SECURITY] ${flag} cannot be enabled in production`);
    }
  }
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 10 in production');
  }
  if (!isHttpsUrl(process.env.FRAPPE_BASE_URL)) throw new Error('FRAPPE_BASE_URL must use HTTPS in production');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(process.env.FRAPPE_EXPECTED_APP_VERSION!)) {
    throw new Error('FRAPPE_EXPECTED_APP_VERSION must be a valid semantic version in production');
  }
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw new Error('JWT_SECRET must contain at least 32 characters in production');
  if ((process.env.OTP_HASH_SECRET?.length ?? 0) < 32) throw new Error('OTP_HASH_SECRET must contain at least 32 characters in production');
  if ((process.env.FRAPPE_CALLBACK_SECRET?.length ?? 0) < 32) throw new Error('FRAPPE_CALLBACK_SECRET must contain at least 32 characters in production');
  if ((process.env.RAZORPAY_WEBHOOK_SECRET?.length ?? 0) < 32) throw new Error('RAZORPAY_WEBHOOK_SECRET must contain at least 32 characters in production');
  const razorpayMode = process.env.RAZORPAY_MODE ?? 'mock';
  if (!['mock', 'test', 'live'].includes(razorpayMode)) throw new Error('RAZORPAY_MODE must be mock, test, or live');
  if (razorpayMode !== 'mock' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
    throw new Error('Razorpay credentials are required outside mock mode');
  }
  for (const origin of process.env.CORS_ALLOWED_ORIGINS!.split(',')) {
    if (!isHttpsUrl(origin.trim())) throw new Error('CORS_ALLOWED_ORIGINS must contain HTTPS origins in production');
  }
  return process.env;
};
