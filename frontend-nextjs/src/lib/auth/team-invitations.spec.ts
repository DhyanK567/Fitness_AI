import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTeamInvitationInput } from './team-invitations';

test('invitation input enforces identity, role, and Indian mobile rules', () => {
  const errors = validateTeamInvitationInput({ name: 'A', email: 'bad', phone: '1234', role: 'owner' });
  assert.equal(Object.keys(errors).length, 4);
  assert.match(errors.name, /full name/i);
  assert.match(errors.email, /valid work email/i);
  assert.match(errors.phone, /Indian mobile/i);
  assert.match(errors.role, /team role/i);
  assert.deepEqual(validateTeamInvitationInput({ name: 'Ananya Rao', email: 'ananya@studio.in', phone: '+91 98450 91122', role: 'trainer' }), {});
});

test('admin is an accepted server invitation role', () => {
  assert.deepEqual(validateTeamInvitationInput({ name: 'Studio Admin', email: 'admin@studio.in', phone: '9845091122', role: 'admin' }), {});
});
