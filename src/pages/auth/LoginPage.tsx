import { useClerk, useUser } from '@clerk/clerk-react';
import { useAuth } from '../../auth/AuthContext';
import { homeForRole, roles, ROLE_LABELS, type UserRole } from '../../auth/access';
import { Navigate } from 'react-router-dom';

export function LoginPage() {
  const { isSignedIn } = useUser();
  const { user, chooseRole } = useAuth();
  const { openSignIn } = useClerk();
  if (isSignedIn) return <Navigate to={homeForRole(user.role)} replace />;
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="care-brand"><span className="brand-mark">✚</span><span>Diag<span className="text-teal-600">NXT</span><small>CONNECTED CARE</small></span></div>
        <div className="login-story-copy">
          <span className="eyebrow">ONE PATIENT. ONE CONNECTED JOURNEY.</span>
          <h1>Better care,<br />at every step.</h1>
          <p>Keep every assessment, report, and referral connected. Your care workspace is available after you sign in.</p>
          <div className="login-benefits"><span>✓ Connected patient records</span><span>✓ Clear clinical handovers</span><span>✓ Care that moves forward</span></div>
        </div>
        <div className="text-xs text-teal-800">CareLink · Community to clinic, together.</div>
      </section>
      <section className="login-panel">
        <div className="w-full max-w-lg mx-auto">
          <span className="eyebrow">CLINICAL PORTAL</span>
          <h2 className="text-3xl font-bold text-slate-900 mt-3">Welcome back</h2>
          <p className="text-sm text-slate-500 mt-2 mb-7">Sign in to access your clinical workspace.</p>
            <div className="space-y-5">
              <div className="login-access-note"><span className="brand-mark">✚</span><div><strong>Your care network, in one place</strong><p>Sign in securely with your existing account.</p></div></div>
              <div><label htmlFor="login-role" className="block text-sm font-semibold mb-2">Sign in as</label><select id="login-role" value={user.role} onChange={event => chooseRole(event.target.value as UserRole)}>{roles.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></div>
              <button className="btn btn-primary w-full" onClick={() => openSignIn({ forceRedirectUrl: `${window.location.origin}${window.location.pathname}#/` })}>Sign in →</button>
              <p className="text-xs text-slate-400 leading-relaxed">Your session is secured with Clerk.</p>
            </div>

        </div>
      </section>
    </div>
  );
}
