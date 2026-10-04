import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '../i18n';
import { Icon } from './Icon';
import { InstallButton } from './InstallButton';
import { StatusBar } from './StatusBar';

/** App shell: brand header with role + language switches, persistent status bar, boundaries footer. */
export function Layout({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useLang();
  const location = useLocation();
  const navigate = useNavigate();
  const isFacility = location.pathname.startsWith('/facility');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
          <Link to={isFacility ? '/facility' : '/'} className="mr-auto leading-tight min-w-0">
            <div className="text-[0.7rem] sm:text-[0.75rem] font-semibold uppercase tracking-wider text-teal-300 truncate">{t('app.by')}</div>
            <div className="text-lg sm:text-xl font-bold truncate">{t('app.name')}</div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <InstallButton />
            <button
              type="button"
              onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
              className="btn !min-h-[36px] sm:!min-h-[40px] !px-2.5 sm:!px-3 !py-1 bg-white/10 text-white text-[0.8rem] sm:text-[0.85rem]"
              aria-label="Change language"
            >
              {t('lang.toggle')}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-2xl px-3 pb-2 sm:px-4" aria-label="Role">
          <div className="grid w-full grid-cols-2 rounded-xl bg-white/10 p-1 text-[0.85rem] sm:text-[0.9rem]">
            <button
              type="button"
              onClick={() => navigate('/')}
              className={`flex min-h-[38px] sm:min-h-[40px] items-center justify-center gap-1.5 rounded-lg font-semibold ${!isFacility ? 'bg-white text-brand' : 'text-white/85'}`}
              aria-pressed={!isFacility}
            >
              <Icon name="user" size={16} />
              {t('role.frontline')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/facility')}
              className={`flex min-h-[38px] sm:min-h-[40px] items-center justify-center gap-1.5 rounded-lg font-semibold ${isFacility ? 'bg-white text-brand' : 'text-white/85'}`}
              aria-pressed={isFacility}
            >
              <Icon name="building" size={16} />
              {t('role.facility')}
            </button>
          </div>
        </nav>
      </header>

      <StatusBar showSync={!isFacility} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-3 py-3 sm:px-4 sm:py-4">{children}</main>

      <footer className="border-t border-line bg-white">
        <p className="mx-auto max-w-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-center text-[0.75rem] sm:text-[0.8rem] font-semibold text-muted">{t('footer.boundaries')}</p>
      </footer>
    </div>
  );
}

export function BackLink({ to, label }: { to: string; label?: string }) {
  const { t } = useLang();
  return (
    <Link to={to} className="mb-3 inline-flex min-h-[48px] items-center gap-1 font-semibold text-brand">
      <Icon name="back" size={20} />
      {label ?? t('case.back')}
    </Link>
  );
}
