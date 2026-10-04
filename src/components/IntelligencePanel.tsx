import { Link } from 'react-router-dom';
import type { FactRow, Intelligence, Issue } from '../db/types';
import { useLang } from '../i18n';
import { Icon } from './Icon';
import { CareStateChip, Chip } from './StatusChip';
import { SpeakButton } from './SpeakButton';

const STATE_TONE = { known: 'ok', unknown: 'warn', missing: 'danger', na: 'neutral' } as const;

function FactLine({ row }: { row: FactRow }) {
  const { t, formatDate } = useLang();
  const isDate = row.key === 'fact.referralDate' || row.key === 'fact.appointment';
  const value = row.valueKey ? t(row.valueKey) : row.value ? (isDate ? formatDate(row.value) : row.value) : undefined;
  return (
    <li className="flex items-start justify-between gap-3 border-b border-line/70 py-2 last:border-0">
      <span className="text-muted">{t(row.key)}</span>
      <span className="text-right">
        {row.state === 'known' ? (
          <>
            <span className="font-semibold">{value}</span>
            {row.source && <span className="block text-[0.78rem] text-muted">{t(`source.${row.source}`)}</span>}
          </>
        ) : (
          <Chip tone={STATE_TONE[row.state]}>{t(`factState.${row.state}`)}</Chip>
        )}
      </span>
    </li>
  );
}

function IssueList({ title, issues, tone, icon }: { title: string; issues: Issue[]; tone: string; icon: string }) {
  const { t, formatDate } = useLang();
  if (issues.length === 0) return null;
  return (
    <div>
      <h4 className={`mb-1 flex items-center gap-1.5 text-[0.9rem] font-bold ${tone}`}>
        <Icon name={icon} size={16} />
        {title}
      </h4>
      <ul className="space-y-1">
        {issues.map((i, idx) => (
          <li key={idx} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{t(i.key, i.params && 'date' in i.params ? { ...i.params, date: formatDate(String(i.params.date)) } : i.params)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** CareLink Intelligence panel: care state, fact table with provenance, gaps, and one suggested action. */
export function IntelligencePanel({ intel, referralId }: { intel: Intelligence; referralId: string }) {
  const { t } = useLang();
  const actionText = t(`action.${intel.action}`);
  const reasonText = t(intel.reason.key, intel.reason.params);
  const takeHref =
    intel.action === 'send_referral'
      ? '/sync'
      : intel.action === 'complete_details' || intel.action === 'resolve_conflict'
        ? `/case/${referralId}/edit?suggested=${intel.action}`
        : `/case/${referralId}/follow-up?suggested=${intel.action}`;

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-accent/40 bg-white" aria-label="Intelligence">
      <div className="space-y-4 p-4">
        <div>
          <div className="mb-1 text-[0.85rem] font-semibold uppercase tracking-wide text-muted">{t('intel.careState')}</div>
          <CareStateChip state={intel.careState} />
        </div>

        {intel.action !== 'none' && (
          <div className="rounded-xl border border-brand/20 bg-brand/5 p-3" data-testid="suggested-action">
            <div className="text-[0.85rem] font-semibold uppercase tracking-wide text-muted">{t('intel.suggested')}</div>
            <div className="mt-1 text-xl font-bold text-brand">{actionText}</div>
            <p className="mt-1">
              <span className="font-semibold">{t('intel.why')}: </span>
              {reasonText}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Link to={takeHref} className="btn btn-primary btn-block text-center" role="button">
                {t('intel.take')}
              </Link>
              <SpeakButton
                className="w-full sm:w-auto"
                segments={[
                  { key: `careState.${intel.careState}` },
                  { key: 'intel.suggested' },
                  { key: `action.${intel.action}` },
                  { text: reasonText },
                ]}
              />
            </div>
            <Link to={`/case/${referralId}/follow-up?suggested=${intel.action}&choose=1`} className="btn btn-ghost btn-block mt-1" role="button">
              {t('intel.different')}
            </Link>
          </div>
        )}

        <IssueList title={t('intel.contradictions')} issues={intel.contradictions} tone="text-danger" icon="alert" />
        <IssueList title={t('intel.missing')} issues={intel.missing} tone="text-danger" icon="alert" />
        <IssueList title={t('intel.unresolved')} issues={intel.unresolved} tone="text-warn" icon="info" />
        {intel.contradictions.length + intel.missing.length + intel.unresolved.length === 0 && (
          <p className="text-muted">{t('intel.noIssues')}</p>
        )}

        <details open className="rounded-xl border border-line">
          <summary className="cursor-pointer px-3 py-3 font-semibold">{t('intel.facts')}</summary>
          <ul className="px-3 pb-2">
            {intel.facts.map((f) => (
              <FactLine key={f.key} row={f} />
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
