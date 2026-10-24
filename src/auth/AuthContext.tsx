import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import type { CareUnit } from '../db/types';
import { isUnit, normalizeRole, ROLE_LABELS, type UserRole } from './access';
export type { UserRole } from './access';
export interface AuthUser {
  id: string; name: string; role: UserRole; unit: CareUnit;
  facilityName: string; tierName: string; designation: string;
}
interface AuthContextType {
  user: AuthUser; logout: () => void; switchUnit: (unit: CareUnit) => void;
  chooseRole: (role: UserRole) => void; isAuthenticated: boolean; isSuperAdmin: boolean;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const ROLE_KEY = 'diagnxt_login_role';
export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [unit, setUnit] = useState<CareUnit>('a');
  const [selectedRole, setSelectedRole] = useState<UserRole>(() => normalizeRole(sessionStorage.getItem(ROLE_KEY)) || 'super_admin');
  const assignedRole = normalizeRole(clerkUser?.publicMetadata?.role);
  const role = assignedRole || selectedRole;
  const isAuthenticated = !!(isLoaded && isSignedIn && clerkUser);
  const user: AuthUser = {
    id: clerkUser?.id || '', name: clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress || 'Healthcare professional',
    role, unit, facilityName: 'DiagNXT CareLink', tierName: ROLE_LABELS[role], designation: ROLE_LABELS[role],
  };
  useEffect(() => {
    localStorage.removeItem('diagnxt_active_user');
    sessionStorage.removeItem('diagnxt_active_user');
    sessionStorage.removeItem('care_role_choice');
    sessionStorage.removeItem('care_unit_choice');
  }, []);
  const chooseRole = (next: UserRole) => {
    if (!normalizeRole(next) || assignedRole) return;
    setSelectedRole(next); sessionStorage.setItem(ROLE_KEY, next);
  };
  const logout = () => { setUnit('a'); sessionStorage.removeItem(ROLE_KEY); void signOut(); };
  const switchUnit = (next: CareUnit) => { if (isUnit(next)) setUnit(next); };
  return <AuthContext.Provider value={{ user, logout, switchUnit, chooseRole, isAuthenticated, isSuperAdmin: isAuthenticated && role === 'super_admin' }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
