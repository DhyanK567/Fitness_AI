import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatIndianMobile,
  formatInr,
  formatIstDateTime,
  isValidIndianMobile,
  normalizeIndianMobile,
} from './india';

test('formatInr uses Indian lakh grouping and no decimal places', () => {
  assert.equal(formatInr(1_000), '₹1,000');
  assert.equal(formatInr(25_000), '₹25,000');
  assert.equal(formatInr(150_000), '₹1,50,000');
});

test('Indian mobile validation accepts supported +91 forms and rejects invalid numbers', () => {
  assert.equal(isValidIndianMobile('9845091122'), true);
  assert.equal(isValidIndianMobile('+91 9845091122'), true);
  assert.equal(isValidIndianMobile('+91 98450 91122'), true);
  assert.equal(isValidIndianMobile('5845091122'), false);
  assert.equal(isValidIndianMobile('984509112'), false);
});

test('Indian mobile normalization and display are canonical', () => {
  assert.equal(normalizeIndianMobile('91-98450-91122'), '+919845091122');
  assert.equal(formatIndianMobile('9845091122'), '+91 98450 91122');
});

test('date-time formatting always renders in IST with an uppercase day period', () => {
  assert.match(formatIstDateTime('2026-10-24T01:30:00.000Z'), /24 Oct 2026/);
  assert.match(formatIstDateTime('2026-10-24T01:30:00.000Z'), /07:00 AM IST/);
});
