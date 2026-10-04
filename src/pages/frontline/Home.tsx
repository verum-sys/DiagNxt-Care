import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { CareStateChip, DueChip, SyncChip } from '../../components/StatusChip';
import { listCases } from '../../db/repo';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { rankCases, type CaseSummary } from '../../intelligence/priority';
import { useSettings } from '../../settings';

function CaseCard({ c, highlight }: { c: CaseSummary; highlight?: boolean }) {
  const { t } = useLang();
  const { patient, referral, intel } = c;
  const waiting = intel.careState === 'awaiting_facility' || intel.careState === 'not_sent';
  return (
    <Link
      to={`/case/${referral.id}`}
      className={`card block transition hover:border-brand/40 ${highlight ? 'border-l-4 border-l-warn' : ''}`}
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

export function Home() {
  const { t } = useLang();
  const { workerName } = useSettings();
  const { data, loading } = useLive(listCases, []);
  const ranked = data ? rankCases(data) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-[1.35rem] font-bold truncate">{t('home.greeting', { name: workerName })}</h1>
        <Link to="/sync" className="btn btn-ghost !min-h-[38px] !px-2.5 text-[0.85rem] sm:text-[0.9rem] shrink-0">
          <Icon name="sync" size={16} />
          <span>{t('home.sync')}</span>
        </Link>
      </div>

      <Link to="/new" className="btn btn-primary btn-block !min-h-[48px] sm:!min-h-[56px] text-base sm:text-lg shadow-sm" role="button" data-testid="new-case">
        <Icon name="plus" size={20} />
        {t('home.newCase')}
      </Link>

      {loading || !ranked ? (
        <p className="text-muted">…</p>
      ) : (
        <>
          <section aria-labelledby="attn">
            <h2 id="attn" className="mb-2 text-lg font-bold">
              {t('home.needsAttention')} <span className="text-muted">({ranked.needsAttention.length})</span>
            </h2>
            <div className="space-y-3">
              {ranked.needsAttention.map((c) => (
                <CaseCard key={c.referral.id} c={c} highlight />
              ))}
              {ranked.needsAttention.length === 0 && <p className="card text-muted">{t('home.empty')}</p>}
            </div>
          </section>

          {ranked.active.length > 0 && (
            <section aria-labelledby="active">
              <h2 id="active" className="mb-2 text-lg font-bold">
                {t('home.active')} <span className="text-muted">({ranked.active.length})</span>
              </h2>
              <div className="space-y-3">
                {ranked.active.map((c) => (
                  <CaseCard key={c.referral.id} c={c} />
                ))}
              </div>
            </section>
          )}

          {ranked.closed.length > 0 && (
            <section aria-labelledby="closed">
              <h2 id="closed" className="mb-2 text-lg font-bold">
                {t('home.closed')} <span className="text-muted">({ranked.closed.length})</span>
              </h2>
              <div className="space-y-3">
                {ranked.closed.map((c) => (
                  <CaseCard key={c.referral.id} c={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
