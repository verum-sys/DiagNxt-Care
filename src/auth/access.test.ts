import { describe, expect, it } from 'vitest';
import { canAccessPath, homeForRole, normalizeRole, isRole, isUnit, roles } from './access';
describe('account roles and care modules', () => {
  it('matches the seven reference account roles and excludes care tiers', () => {
    expect(roles).toEqual(['super_admin', 'admin', 'doctor', 'nurse', 'compounder', 'ambulance_member', 'emergency_member']);
    for (const tier of ['asha', 'phc', 'dh', 'tcc']) expect(isRole(tier)).toBe(false);
    expect(normalizeRole('SUPERADMIN')).toBe('super_admin');
    expect(normalizeRole('DOCTOR')).toBe('doctor');
  });
  it('keeps the four care modules inside the Super Admin workspace', () => {
    for (const tier of ['asha', 'phc', 'dh', 'tcc']) {
      expect(canAccessPath('super_admin', `/tier/${tier}`)).toBe(true);
      for (const role of roles.filter(role => role !== 'super_admin')) {
        expect(canAccessPath(role, `/tier/${tier}`)).toBe(false);
        expect(canAccessPath(role, '/')).toBe(false);
        expect(canAccessPath(role, '/cbac')).toBe(false);
        expect(canAccessPath(role, homeForRole(role))).toBe(true);
      }
    }
  });
  it('rejects malformed role and unit selections', () => {
    expect(isRole('owner')).toBe(false); expect(isRole(null)).toBe(false);
    expect(isUnit('d')).toBe(false); expect(isUnit(undefined)).toBe(false);
    expect(isUnit('b')).toBe(true);
  });
});
