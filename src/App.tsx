import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { ClerkAuthProvider } from './auth/ClerkAuthProvider';
import { useUser } from '@clerk/clerk-react';
import { canAccessPath, homeForRole } from './auth/access';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Icon } from './components/Icon';
import { useLang } from './i18n';
import { SuperAdminDashboard } from './pages/admin/SuperAdminDashboard';
import { TierModuleView } from './pages/tiers/TierModuleView';
import { RoleDashboard } from './pages/auth/RoleDashboard';
import { LoginPage } from './pages/auth/LoginPage';
import { Inbox } from './pages/facility/Inbox';
import { ReferralDetail } from './pages/facility/ReferralDetail';
import { CaseView } from './pages/frontline/CaseView';
import { CategoryCases } from './pages/frontline/CategoryCases';
import { CbacScreening } from './pages/frontline/CbacScreening';
import { getCase } from './db/repo';
import { useLive } from './db/useLive';
import { Home } from './pages/frontline/Home';
import { NewCase } from './pages/frontline/NewCase';
import { RecordFollowUp } from './pages/frontline/RecordFollowUp';
import { SyncPage } from './pages/frontline/SyncPage';

/** Short confirmation passed through navigation state, e.g. "Saved on this device". */
function Toast() {
  const location = useLocation();
  const { t } = useLang();
  const key = (location.state as { toast?: string } | null)?.toast;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!key) return;
    setVisible(true);
    const h = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(h);
  }, [key, location.key]);
  if (!key || !visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status">
      <div className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-xl border border-slate-700">
        <Icon name="check" size={18} className="text-teal-300" />
        {t(key)}
      </div>
    </div>
  );
}

function AccessGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isLoaded) return <div className="min-h-screen grid place-items-center text-teal-700" role="status">Loading secure portal…</div>;
  if (location.pathname === '/login') return <>{children}</>;
  if (!isSignedIn || !isAuthenticated) return <Navigate to="/login" replace />;
  if (!canAccessPath(user.role, location.pathname)) return <Navigate to={homeForRole(user.role)} replace />;
  const caseId = location.pathname.match(/^\/case\/([^/]+)/)?.[1];
  if (caseId && user.role !== 'super_admin') return <CaseAccess key={caseId} caseId={caseId}>{children}</CaseAccess>;
  return <>{children}</>;
}

function CaseAccess({ caseId, children }: { caseId: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: record, loading } = useLive(() => getCase(caseId), [caseId]);
  if (loading) return <div role="status" className="p-8">Loading patient record…</div>;
  if (!record || (record.referral.unit || 'a') !== user.unit) return <Navigate to={homeForRole(user.role)} replace />;
  return <>{children}</>;
}

function TierRoute() {
  const location = useLocation();
  return <TierModuleView key={location.pathname + location.search} />;
}

export function App() {
  return (
    <ClerkAuthProvider>
      <AuthProvider>
        <HashRouter>
          <AccessGate><Layout>
            <Routes>
              <Route path="/" element={<SuperAdminDashboard />} />
              <Route path="/tier/:tier" element={<TierRoute />} />
              <Route path="/workspace" element={<RoleDashboard />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/frontline" element={<Home />} />
              <Route path="/new" element={<NewCase />} />
              <Route path="/cbac" element={<CbacScreening />} />
              <Route path="/cases" element={<CategoryCases />} />
              <Route path="/cases/:category" element={<CategoryCases />} />
              <Route path="/case/:id" element={<CaseView />} />
              <Route path="/case/:id/edit" element={<NewCase />} />
              <Route path="/case/:id/cbac" element={<CbacScreening />} />
              <Route path="/case/:id/follow-up" element={<RecordFollowUp />} />
              <Route path="/sync" element={<SyncPage />} />
              <Route path="/facility" element={<Inbox />} />
              <Route path="/facility/referral/:id" element={<ReferralDetail />} />
              <Route path="*" element={<SuperAdminDashboard />} />
            </Routes>
          </Layout></AccessGate>
          <Toast />
        </HashRouter>
      </AuthProvider>
    </ClerkAuthProvider>
  );
}
