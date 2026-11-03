import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_TIERS } from '@/components/pricing/StudioPricingSection';
import { PASSWORD_RULES } from '@/lib/auth/studio-auth';
import { isValidIndianMobile } from '@/lib/localization/india';
import { createHmac } from 'node:crypto';

test('1. Studio Platform Subscription Plans Specification', () => {
  assert.equal(STUDIO_TIERS.length, 3);

  const basic = STUDIO_TIERS.find((t) => t.name === 'Basic');
  assert.ok(basic, 'Basic plan exists');
  assert.equal(basic.priceInr, 1000, 'Basic plan is ₹1,000/month');
  assert.equal(basic.code, 'Basic');

  const premium = STUDIO_TIERS.find((t) => t.name === 'Premium');
  assert.ok(premium, 'Premium plan exists');
  assert.equal(premium.priceInr, 2000, 'Premium plan is ₹2,000/month');
  assert.equal(premium.code, 'Premium');

  const ultra = STUDIO_TIERS.find((t) => t.name === 'Ultra Premium');
  assert.ok(ultra, 'Ultra Premium plan exists');
  assert.equal(ultra.priceInr, 3000, 'Ultra Premium plan is ₹3,000/month');
  assert.equal(ultra.code, 'Ultra Premium');
});

test('2. Business Info & Address Validation Rules', () => {
  function validateBusinessInfo(input: {
    studioName: string;
    ownerName: string;
    email: string;
    phone: string;
    studioAddress: string;
    studioCity: string;
    studioPincode: string;
  }) {
    if (input.studioName.trim().length < 2) return 'Enter a studio or facility name (at least 2 characters).';
    if (input.ownerName.trim().length < 2) return 'Enter the owner’s full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Enter a valid work email address.';
    if (!isValidIndianMobile(input.phone)) return 'Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.';
    if (input.studioAddress.trim().length < 4) return 'Enter the street address for your studio facility.';
    if (input.studioCity.trim().length < 2) return 'Enter the city where your studio is located.';
    if (!/^[1-9][0-9]{5}$/.test(input.studioPincode.trim())) return 'Enter a valid 6-digit Indian PIN code (e.g. 560001).';
    return '';
  }

  // Valid studio details
  const valid = validateBusinessInfo({
    studioName: 'Ananda Yoga & Movement',
    ownerName: 'Priya Sharma',
    email: 'priya@anandayoga.in',
    phone: '+91 98450 12345',
    studioAddress: '42 100 Feet Road, Indiranagar',
    studioCity: 'Bengaluru',
    studioPincode: '560038',
  });
  assert.equal(valid, '');

  // Invalid studio name
  assert.equal(
    validateBusinessInfo({
      studioName: 'A',
      ownerName: 'Priya Sharma',
      email: 'priya@anandayoga.in',
      phone: '+91 98450 12345',
      studioAddress: '42 100 Feet Road',
      studioCity: 'Bengaluru',
      studioPincode: '560038',
    }),
    'Enter a studio or facility name (at least 2 characters).',
  );

  // Invalid email
  assert.equal(
    validateBusinessInfo({
      studioName: 'Ananda Yoga',
      ownerName: 'Priya Sharma',
      email: 'not-an-email',
      phone: '+91 98450 12345',
      studioAddress: '42 100 Feet Road',
      studioCity: 'Bengaluru',
      studioPincode: '560038',
    }),
    'Enter a valid work email address.',
  );

  // Invalid PIN code
  assert.equal(
    validateBusinessInfo({
      studioName: 'Ananda Yoga',
      ownerName: 'Priya Sharma',
      email: 'priya@anandayoga.in',
      phone: '+91 98450 12345',
      studioAddress: '42 100 Feet Road',
      studioCity: 'Bengaluru',
      studioPincode: '01234',
    }),
    'Enter a valid 6-digit Indian PIN code (e.g. 560001).',
  );
});

test('3. Razorpay Subscription Order & Cryptographic Signature Verification', () => {
  const keySecret = 'test_secret_for_studio_sub_spec';
  const orderId = 'order_test_9876543210ab';
  const paymentId = 'pay_test_1234567890cd';

  // Compute authentic HMAC-SHA256 signature
  const validSignature = createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  function verifySignature(ordId: string, payId: string, sig: string, secret: string): boolean {
    const expected = createHmac('sha256', secret)
      .update(`${ordId}|${payId}`)
      .digest('hex');
    return expected === sig;
  }

  assert.ok(verifySignature(orderId, paymentId, validSignature, keySecret), 'Authentic signature verifies successfully');

  // Tampered payment ID
  assert.strictEqual(
    verifySignature(orderId, 'pay_tampered', validSignature, keySecret),
    false,
    'Tampered payment ID rejected',
  );

  // Tampered order ID
  assert.strictEqual(
    verifySignature('order_tampered', paymentId, validSignature, keySecret),
    false,
    'Tampered order ID rejected',
  );

  // Fake signature
  assert.strictEqual(
    verifySignature(orderId, paymentId, 'bad_signature', keySecret),
    false,
    'Arbitrary fake signature rejected',
  );
});

test('4. Password 5-rule criteria enforcement', () => {
  const weakPassword = 'short';
  assert.ok(!PASSWORD_RULES.every((r) => r.test(weakPassword)), 'Weak password fails 5 rules');

  const strongPassword = 'StrongPassword!99#';
  assert.ok(PASSWORD_RULES.every((r) => r.test(strongPassword)), 'Strong password passes all 5 security rules');
});
