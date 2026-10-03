import { useEffect, useState } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Icon } from './components/Icon';
import { useLang } from './i18n';
import { Inbox } from './pages/facility/Inbox';
import { ReferralDetail } from './pages/facility/ReferralDetail';
import { CaseView } from './pages/frontline/CaseView';
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
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4" role="status">
      <div className="flex items-center gap-2 rounded-xl bg-ink px-4 py-3 font-semibold text-white shadow-lg">
        <Icon name="check" size={18} className="text-teal-300" />
        {t(key)}
      </div>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewCase />} />
          <Route path="/case/:id" element={<CaseView />} />
          <Route path="/case/:id/edit" element={<NewCase />} />
          <Route path="/case/:id/follow-up" element={<RecordFollowUp />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/facility" element={<Inbox />} />
          <Route path="/facility/referral/:id" element={<ReferralDetail />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
      <Toast />
    </HashRouter>
  );
}
