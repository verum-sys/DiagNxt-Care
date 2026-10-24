import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginPage } from './LoginPage';
const state = vi.hoisted(() => ({ signedIn: false, role: 'super_admin' }));
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ isSignedIn: state.signedIn }),
  useClerk: () => ({ openSignIn: vi.fn() }),
}));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: state.role }, chooseRole: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ Navigate: ({ to }: { to: string }) => <span data-redirect={to} /> }));
describe('reference login roles', () => {
  it('shows account roles without care modules or unit choices before sign-in', () => {
    state.signedIn = false;
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain('Sign in →');
    for (const label of ['Super Admin', 'Hospital Admin', 'Doctor', 'Nurse', 'Compounder', 'Ambulance Member', 'Emergency Member']) expect(html).toContain(label);
    for (const label of ['ASHA', 'PHC', 'District Hospital', 'TCC', 'Facility unit']) expect(html).not.toContain(label);
  });
  it('sends Super Admin to the four-card dashboard after sign-in', () => {
    state.signedIn = true; state.role = 'super_admin';
    expect(renderToStaticMarkup(<LoginPage />)).toContain('data-redirect="/"');
  });
  it('sends other account roles to their workspace', () => {
    state.signedIn = true; state.role = 'doctor';
    expect(renderToStaticMarkup(<LoginPage />)).toContain('data-redirect="/workspace"');
  });
});
