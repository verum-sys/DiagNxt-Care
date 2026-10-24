import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABELS } from '../../auth/access';
export function RoleDashboard() {
  const { user } = useAuth();
  return <div className="space-y-6"><div><span className="eyebrow">CLINICAL PORTAL</span><h1 className="text-3xl font-semibold mt-2">{ROLE_LABELS[user.role]} workspace</h1><p className="text-sm text-slate-500 mt-2">Welcome, {user.name}. View patient records and referral activity for Unit {user.unit.toUpperCase()}.</p></div><div className="grid sm:grid-cols-2 gap-5"><Link className="registry-panel block" to="/cases"><h2 className="font-semibold">Patient registry →</h2><p className="text-sm text-slate-500 mt-2">Find and review patient records.</p></Link><Link className="registry-panel block" to="/facility"><h2 className="font-semibold">Referral inbox →</h2><p className="text-sm text-slate-500 mt-2">Review incoming referrals and care updates.</p></Link></div></div>;
}
