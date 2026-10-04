import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CaseStageSummary } from '../../components/CaseStageSummary';
import { IntelligencePanel } from '../../components/IntelligencePanel';
import { BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { Chip, SyncChip } from '../../components/StatusChip';
import { Timeline } from '../../components/Timeline';
import { getCase, listSyncEvents } from '../../db/repo';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { analyze } from '../../intelligence/engine';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

export function CaseView() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { t, formatDate } = useLang();
  const [showStageSummary, setShowStageSummary] = useState(
    !!(location.state as { showStageSummary?: boolean } | null)?.showStageSummary,
  );
  const { data, loading } = useLive(async () => {
    const [c, syncEvents] = await Promise.all([getCase(id), listSyncEvents()]);
    return c ? { ...c, syncEvents } : null;
  }, [id]);

  if (loading) return <p className="text-muted">…</p>;
  if (!data)
    return (
      <div>
        <BackLink to="/" />
        <p className="card">{t('case.notFound')}</p>
      </div>
    );

  const { patient, referral, followUps, facilityEvents, syncEvents } = data;
  const intel = analyze(patient, referral, followUps);

  return (
    <div className="space-y-4">
      <BackLink to="/" />

      <section className="card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[1.4rem] font-bold">{patient.name || '—'}</h1>
            <div className="text-muted">
              {patient.id}
              {patient.age !== undefined && ` · ${t('case.years', { n: patient.age })}`}
              {patient.sex && ` · ${t(`sex.${patient.sex}`)}`}
            </div>
          </div>
          <SyncChip status={referral.syncStatus} />
        </div>
        <dl className="mt-2 divide-y divide-line/70">
          <Row label={t('form.phone')}>
            {patient.phone ? (
              <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 text-brand underline">
                <Icon name="phone" size={16} />
                {patient.phone}
              </a>
            ) : (
              <Chip tone="danger">{t('factState.missing')}</Chip>
            )}
          </Row>
          <Row label={t('form.locality')}>{patient.locality || '—'}</Row>
        </dl>
      </section>

      {showStageSummary && (
        <CaseStageSummary
          patient={patient}
          referral={referral}
          followUps={followUps}
          dismissible
          onDismiss={() => setShowStageSummary(false)}
        />
      )}

      <IntelligencePanel intel={intel} referralId={referral.id} />

      <section className="card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('case.referral')}</h2>
          <Link to={`/case/${referral.id}/edit`} className="btn btn-ghost !px-2 text-[0.9rem]">
            {t('case.edit')}
          </Link>
        </div>
        <dl className="divide-y divide-line/70">
          <Row label={t('form.destination')}>{referral.destinationFacility || <Chip tone="danger">{t('factState.missing')}</Chip>}</Row>
          <Row label={t('form.reason')}>{referral.reason || <Chip tone="danger">{t('factState.missing')}</Chip>}</Row>
          <Row label={t('form.referralDate')}>{formatDate(referral.referralDate)}</Row>
          <Row label={t('form.urgency')}>{t(`urgency.${referral.urgency}`)}</Row>
          {referral.screening && (
            <>
              <Row label={t('parsed.screeningCompleted')}>
                {referral.screening.completed ? t('screening.completed.yes') : t('screening.completed.no')}
              </Row>
              {referral.screening.area && (
                <Row label={t('parsed.screeningArea')}>{t(`screening.area.${referral.screening.area}`)}</Row>
              )}
              {referral.screening.finding && (
                <Row label={t('parsed.screeningFinding')}>{t(`screening.finding.${referral.screening.finding}`)}</Row>
              )}
              {referral.screening.referralRequired && (
                <Row label={t('parsed.referralRequired')}>{t(`referralRequired.${referral.screening.referralRequired}`)}</Row>
              )}
            </>
          )}
          <Row label={t('case.referredBy')}>{referral.referringWorker}</Row>
          {referral.notes && <Row label={t('case.notes')}>{referral.notes}</Row>}
        </dl>
        {referral.facility.notes.length > 0 && (
          <div className="mt-3 rounded-xl bg-info-soft p-3">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-brand">
              <Icon name="building" size={16} />
              {t('timeline.facility')}
            </div>
            {referral.facility.notes.map((n, i) => (
              <p key={i} className="text-[0.95rem]">
                “{n.text}”
              </p>
            ))}
          </div>
        )}
      </section>

      <Link to={`/case/${referral.id}/follow-up`} className="btn btn-primary btn-block !min-h-[56px] text-lg" role="button">
        {t('case.recordFollowUp')}
      </Link>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{t('case.timeline')}</h2>
        <Timeline referral={referral} followUps={followUps} facilityEvents={facilityEvents} syncEvents={syncEvents} />
      </section>
    </div>
  );
}
