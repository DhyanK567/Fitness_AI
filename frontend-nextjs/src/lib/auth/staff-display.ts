const GENERIC_NAMES = new Set([
  'front desk', 'front desk staff', 'staff', 'staff member', 'staff portal',
  'studio staff', 'studio team', 'reception', 'receptionist', 'admin',
  'studio admin', 'trainer', 'coach', 'fitness studio os',
]);

/** True only for a person's name, never a role, portal label, or email address. */
export function isPersonalStaffName(rawName?: string | null): boolean {
  if (!rawName) return false;
  const trimmed = rawName.trim();
  if (trimmed.length < 2 || trimmed.includes('@')) return false;
  const normalized = trimmed.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (GENERIC_NAMES.has(normalized)) return false;
  return /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*)*$/u.test(trimmed);
}
