import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { CareStateChip, DueChip, SyncChip, CARE_STATE_TONE } from '../../components/StatusChip';
import { listCases } from '../../db/repo';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { rankCases, type CaseSummary } from '../../intelligence/priority';

export type CaseCategory = 'critical' | 'pending' | 'on_track';

export function getCaseCategory(c: CaseSummary): CaseCategory {
  const state = c.intel.careState;
  const tone = CARE_STATE_TONE[state];
  if (
    c.referral.urgency === 'urgent' ||
    tone === 'danger' ||
    state === 'appt_passed_unknown' ||
    state === 'incomplete' ||
    state === 'declined' ||
    state === 'not_attended'
  ) {
    return 'critical';
  }
  if (
    c.referral.syncStatus === 'pending' ||
    tone === 'warn' ||
    state === 'not_sent' ||
    state === 'awaiting_facility' ||
    state === 'accepted_no_appt' ||
    state === 'info_requested' ||
    state === 'attended_outcome_unknown' ||
    state === 'follow_up_required'
  ) {
    return 'pending';
  }
  return 'on_track';
}

export function CaseCard({ c, category }: { c: CaseSummary; category?: CaseCategory }) {
  const { t } = useLang();
  const { patient, referral, intel } = c;
  const waiting = intel.careState === 'awaiting_facility' || intel.careState === 'not_sent';
  const borderTone =
    category === 'critical'
      ? 'border-l-4 border-l-danger'
      : category === 'pending'
        ? 'border-l-4 border-l-warn'
        : category === 'on_track'
          ? 'border-l-4 border-l-brand'
          : '';

  return (
    <Link
      to={`/case/${referral.id}`}
      className={`card block transition hover:border-brand/40 ${borderTone}`}
      data-testid="case-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold">{patient.name || '—'}</div>
          <div className="text-[0.85rem] text-muted">
            {patient.id}
            {patient.age !== undefined && ` · ${t('case.years', { n: patient.age })}`}
            {patient.locality && ` · ${patient.locality}`}
          </div>
        </div>
        <Icon name="chevron" className="mt-1 text-muted" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <CareStateChip state={intel.careState} />
        <DueChip days={intel.dueInDays} waiting={waiting} />
        {referral.urgency === 'urgent' && <span className="chip bg-danger text-white">{t('urgency.urgent')}</span>}
        {referral.syncStatus === 'pending' && <SyncChip status="pending" />}
      </div>
      {intel.action !== 'none' && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-accent-soft/60 px-2.5 py-2 text-[0.95rem] text-brand">
          <Icon name="spark" size={16} className="mt-0.5 text-accent" />
          <span className="font-semibold">{t(`action.${intel.action}`)}</span>
        </div>
      )}
    </Link>
  );
}

function normalizeCategory(param?: string): 'all' | CaseCategory {
  if (param === 'critical') return 'critical';
  if (param === 'pending') return 'pending';
  if (param === 'ontrack' || param === 'on_track' || param === 'on-track') return 'on_track';
  return 'all';
}

export function CategoryCases() {
  const { category: routeParam } = useParams<{ category?: string }>();
  const initialCategory = normalizeCategory(routeParam);
  const [activeTab, setActiveTab] = useState<'all' | CaseCategory>(initialCategory);
  const { t } = useLang();
  const { data, loading } = useLive(listCases, []);
  const ranked = data ? rankCases(data) : null;

  const allOpenCases: CaseSummary[] = ranked ? [...ranked.needsAttention, ...ranked.active] : [];
  const criticalCases = allOpenCases.filter((c) => getCaseCategory(c) === 'critical');
  const pendingCases = allOpenCases.filter((c) => getCaseCategory(c) === 'pending');
  const onTrackCases = allOpenCases.filter((c) => getCaseCategory(c) === 'on_track');
  const closedCases = ranked ? ranked.closed : [];

  const tabCounts = {
    all: allOpenCases.length,
    critical: criticalCases.length,
    pending: pendingCases.length,
    on_track: onTrackCases.length,
  };

  const currentCases =
    activeTab === 'critical'
      ? criticalCases
      : activeTab === 'pending'
        ? pendingCases
        : activeTab === 'on_track'
          ? onTrackCases
          : allOpenCases;

  const titleConfig = {
    critical: {
      title: t('cases.title.critical'),
      subtitle: t('cases.subtitle.critical'),
      icon: 'alert',
      tone: 'text-danger',
      badgeTone: 'bg-danger-soft text-danger border-danger/30',
    },
    pending: {
      title: t('cases.title.pending'),
      subtitle: t('cases.subtitle.pending'),
      icon: 'sync',
      tone: 'text-warn',
      badgeTone: 'bg-warn-soft text-warn border-warn/30',
    },
    on_track: {
      title: t('cases.title.on_track'),
      subtitle: t('cases.subtitle.on_track'),
      icon: 'check',
      tone: 'text-brand',
      badgeTone: 'bg-info-soft text-brand border-brand/30',
    },
    all: {
      title: t('cases.title.all'),
      subtitle: t('cases.subtitle.all'),
      icon: 'spark',
      tone: 'text-brand',
      badgeTone: 'bg-accent-soft text-brand border-accent/30',
    },
  }[activeTab];

  return (
    <div className="space-y-4">
      <BackLink to="/" label={t('home.allCases') + ' ←'} />

      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-2 ${titleConfig.tone}`}>
            <Icon name={titleConfig.icon} size={24} />
            <span>{titleConfig.title}</span>
          </h1>
          <span className={`chip border px-2.5 py-0.5 text-sm font-bold ${titleConfig.badgeTone}`}>
            {loading ? '…' : currentCases.length}
          </span>
        </div>
        <p className="text-[0.85rem] text-muted">{titleConfig.subtitle}</p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 pt-1 -mx-1 px-1">
        <button
          type="button"
          onClick={() => setActiveTab('critical')}
          className={`btn !px-3 !py-1.5 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer ${
            activeTab === 'critical' ? 'btn-primary !bg-danger !border-danger text-white' : 'btn-ghost border border-line'
          }`}
        >
          <Icon name="alert" size={14} className="mr-1" />
          {t('home.cardCritical')} ({loading ? '…' : tabCounts.critical})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`btn !px-3 !py-1.5 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer ${
            activeTab === 'pending' ? 'btn-primary !bg-warn !border-warn text-white' : 'btn-ghost border border-line'
          }`}
        >
          <Icon name="sync" size={14} className="mr-1" />
          {t('home.cardPending')} ({loading ? '…' : tabCounts.pending})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('on_track')}
          className={`btn !px-3 !py-1.5 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer ${
            activeTab === 'on_track' ? 'btn-primary !bg-brand !border-brand text-white' : 'btn-ghost border border-line'
          }`}
        >
          <Icon name="check" size={14} className="mr-1" />
          {t('home.cardOnTrack')} ({loading ? '…' : tabCounts.on_track})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`btn !px-3 !py-1.5 text-xs sm:text-sm font-semibold rounded-xl cursor-pointer ${
            activeTab === 'all' ? 'btn-primary text-white' : 'btn-ghost border border-line'
          }`}
        >
          {t('cases.title.all')} ({loading ? '…' : tabCounts.all})
        </button>
      </div>

      {/* Cases Content */}
      {loading || !ranked ? (
        <p className="text-muted">…</p>
      ) : (
        <div className="space-y-4">
          {activeTab !== 'all' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentCases.map((c) => (
                <CaseCard key={c.referral.id} c={c} category={activeTab} />
              ))}
              {currentCases.length === 0 && (
                <div className="card text-center py-8 col-span-full">
                  <p className="text-muted text-base">{t('home.empty')}</p>
                  <Link to="/new" className="btn btn-primary mt-3 inline-flex items-center gap-1.5">
                    <Icon name="plus" size={16} />
                    {t('home.cardNew')}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {criticalCases.length > 0 && (
                <div>
                  <h2 className="mb-2 text-base font-bold text-danger flex items-center gap-1.5">
                    <Icon name="alert" size={16} />
                    {t('home.cardCritical')} ({criticalCases.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {criticalCases.map((c) => (
                      <CaseCard key={c.referral.id} c={c} category="critical" />
                    ))}
                  </div>
                </div>
              )}

              {pendingCases.length > 0 && (
                <div>
                  <h2 className="mb-2 text-base font-bold text-warn flex items-center gap-1.5">
                    <Icon name="sync" size={16} />
                    {t('home.cardPending')} ({pendingCases.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pendingCases.map((c) => (
                      <CaseCard key={c.referral.id} c={c} category="pending" />
                    ))}
                  </div>
                </div>
              )}

              {onTrackCases.length > 0 && (
                <div>
                  <h2 className="mb-2 text-base font-bold text-brand flex items-center gap-1.5">
                    <Icon name="check" size={16} />
                    {t('home.cardOnTrack')} ({onTrackCases.length})
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {onTrackCases.map((c) => (
                      <CaseCard key={c.referral.id} c={c} category="on_track" />
                    ))}
                  </div>
                </div>
              )}

              {closedCases.length > 0 && (
                <details className="rounded-2xl border border-line bg-white/50 p-3">
                  <summary className="cursor-pointer font-bold text-muted">
                    {t('home.closed')} ({closedCases.length})
                  </summary>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    {closedCases.map((c) => (
                      <CaseCard key={c.referral.id} c={c} />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
