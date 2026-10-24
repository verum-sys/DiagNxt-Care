import type { CareUnit } from '../db/types';
// Account roles mirror the reference. Care tiers are modules, not roles.
export const roles = ['super_admin', 'admin', 'doctor', 'nurse', 'compounder', 'ambulance_member', 'emergency_member'] as const;
export type UserRole = typeof roles[number];
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin', admin: 'Hospital Admin', doctor: 'Doctor', nurse: 'Nurse',
  compounder: 'Compounder', ambulance_member: 'Ambulance Member', emergency_member: 'Emergency Member',
};
export const isRole = (value: unknown): value is UserRole => roles.includes(value as UserRole);
export function normalizeRole(value: unknown): UserRole | undefined {
  if (typeof value !== 'string') return undefined;
  const role = value === 'SUPERADMIN' ? 'super_admin' : value.toLowerCase();
  return isRole(role) ? role : undefined;
}
export const isUnit = (value: unknown): value is CareUnit => ['a', 'b', 'c'].includes(value as string);
export const homeForRole = (role: UserRole) => role === 'super_admin' ? '/' : '/workspace';
export function canAccessPath(role: UserRole, path: string) {
  if (role === 'super_admin') return true;
  return ['/workspace', '/cases', '/case', '/facility', '/sync'].some(prefix => path === prefix || path.startsWith(prefix + '/'));
}
