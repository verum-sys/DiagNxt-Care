import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { listCases } from '../../db/repo';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { rankCases, type CaseSummary } from '../../intelligence/priority';
import { useSettings } from '../../settings';
import { getCaseCategory } from './CategoryCases';

export function Home() {
  const { t } = useLang();
  const { workerName } = useSettings();
  const { data, loading } = useLive(listCases, []);
  const ranked = data ? rankCases(data) : null;

  const allOpenCases: CaseSummary[] = ranked ? [...ranked.needsAttention, ...ranked.active] : [];
  const criticalCases = allOpenCases.filter((c) => getCaseCategory(c) === 'critical');
  const pendingCases = allOpenCases.filter((c) => getCaseCategory(c) === 'pending');
  const onTrackCases = allOpenCases.filter((c) => getCaseCategory(c) === 'on_track');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-[1.35rem] font-bold truncate">
          {t('home.greeting', { name: workerName })}
        </h1>
        <Link to="/sync" className="btn btn-ghost !min-h-[38px] !px-2.5 text-[0.85rem] sm:text-[0.9rem] shrink-0">
          <Icon name="sync" size={16} />
          <span>{t('home.sync')}</span>
        </Link>
      </div>

      {/* 2x2 Square Cards Grid:
          new rfer    ontrack
          pending     critical
      */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-5 max-w-lg mx-auto w-full pt-1">
        {/* Row 1, Col 1: New Referral */}
        <Link
          to="/new"
          className="group aspect-square flex flex-col justify-between rounded-3xl border-2 border-brand/20 bg-gradient-to-br from-brand to-brand-dark p-4 sm:p-5 text-white shadow-sm transition-all duration-200 hover:shadow-lg hover:scale-[1.03] active:scale-[0.98]"
          data-testid="card-new"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-xs group-hover:bg-white group-hover:text-brand transition-colors">
              <Icon name="plus" size={24} />
            </div>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-white/90">
              + Add
            </span>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold leading-tight">
              {t('home.cardNew')}
            </div>
            <div className="mt-1 text-xs sm:text-[0.82rem] text-white/80">
              {t('home.cardNewSub')}
            </div>
          </div>
        </Link>

        {/* Row 1, Col 2: On Track */}
        <Link
          to="/cases/on_track"
          className="group aspect-square flex flex-col justify-between rounded-3xl border-2 border-brand/25 bg-info-soft/75 p-4 sm:p-5 text-brand shadow-sm transition-all duration-200 hover:shadow-lg hover:border-brand/50 hover:scale-[1.03] active:scale-[0.98]"
          data-testid="card-ontrack"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-xs">
              <Icon name="check" size={22} />
            </div>
            <span className="text-2xl sm:text-3xl font-black text-brand">
              {loading ? '…' : onTrackCases.length}
            </span>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold leading-tight text-brand">
              {t('home.cardOnTrack')}
            </div>
            <div className="mt-1 text-xs sm:text-[0.82rem] font-medium text-brand/80">
              {t('home.cardOnTrackSub')}
            </div>
          </div>
        </Link>

        {/* Row 2, Col 1: Pending */}
        <Link
          to="/cases/pending"
          className="group aspect-square flex flex-col justify-between rounded-3xl border-2 border-warn/35 bg-warn-soft/75 p-4 sm:p-5 text-warn shadow-sm transition-all duration-200 hover:shadow-lg hover:border-warn hover:scale-[1.03] active:scale-[0.98]"
          data-testid="card-pending"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warn text-white shadow-xs">
              <Icon name="sync" size={22} />
            </div>
            <span className="text-2xl sm:text-3xl font-black text-warn">
              {loading ? '…' : pendingCases.length}
            </span>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold leading-tight text-warn">
              {t('home.cardPending')}
            </div>
            <div className="mt-1 text-xs sm:text-[0.82rem] font-medium text-warn/80">
              {t('home.cardPendingSub')}
            </div>
          </div>
        </Link>

        {/* Row 2, Col 2: Critical */}
        <Link
          to="/cases/critical"
          className="group aspect-square flex flex-col justify-between rounded-3xl border-2 border-danger/35 bg-danger-soft/75 p-4 sm:p-5 text-danger shadow-sm transition-all duration-200 hover:shadow-lg hover:border-danger hover:scale-[1.03] active:scale-[0.98]"
          data-testid="card-critical"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger text-white shadow-xs">
              <Icon name="alert" size={22} />
            </div>
            <span className="text-2xl sm:text-3xl font-black text-danger">
              {loading ? '…' : criticalCases.length}
            </span>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-bold leading-tight text-danger">
              {t('home.cardCritical')}
            </div>
            <div className="mt-1 text-xs sm:text-[0.82rem] font-medium text-danger/80">
              {t('home.cardCriticalSub')}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
