import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackLink } from '../../components/Layout';
import { Chip } from '../../components/StatusChip';
import { Timeline } from '../../components/Timeline';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { addDays, today } from '../../intelligence/dates';
import { analyze } from '../../intelligence/engine';
import { facilityAct, getRemoteCase, type FacilityActionInput } from '../../sync/remote';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

export function ReferralDetail() {
  const { id = '' } = useParams();
  const { t, formatDate } = useLang();
  const { data, loading } = useLive(() => getRemoteCase(id), [id]);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(addDays(today(), 3));
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loading) return <p className="text-muted">…</p>;
  if (!data)
    return (
      <div>
        <BackLink to="/facility" />
        <p className="card">{t('facility.notFound')}</p>
      </div>
    );

  const { patient, referral, followUps, events } = data;
  const f = referral.facility;
  const intel = analyze(patient, referral, followUps);
  const issues = [...intel.contradictions, ...intel.missing, ...intel.unresolved];
  const closed = f.completed || f.response === 'declined';

  async function act(input: FacilityActionInput) {
    setBusy(true);
    try {
      await facilityAct(id, input);
      setNote('');
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }
  const msg = () => note.trim() || undefined;

  return (
    <div className="space-y-4">
      <BackLink to="/facility" />
      <h1 className="text-[1.4rem] font-bold">{t('facility.detail')}</h1>

      <section className="card">
        <div className="text-xl font-bold">{patient.name}</div>
        <dl className="mt-1 divide-y divide-line/70">
          <Row label={t('facility.patientId')}>{patient.id}</Row>
          {patient.age !== undefined && <Row label={t('form.age')}>{t('case.years', { n: patient.age })}</Row>}
          <Row label={t('form.reason')}>{referral.reason || '—'}</Row>
          <Row label={t('facility.referringWorker')}>{referral.referringWorker}</Row>
          <Row label={t('form.referralDate')}>{formatDate(referral.referralDate)}</Row>
          <Row label={t('form.urgency')}>{t(`urgency.${referral.urgency}`)}</Row>
          <Row label={t('facility.response')}>
            <Chip tone={f.response === 'accepted' ? 'ok' : f.response === 'declined' ? 'danger' : 'warn'}>{t(`response.${f.response}`)}</Chip>
          </Row>
          <Row label={t('fact.appointment')}>{f.appointmentDate ? formatDate(f.appointmentDate) : '—'}</Row>
          <Row label={t('fact.attendance')}>{t(`attendance.${f.attendance}`)}</Row>
          {referral.notes && <Row label={t('case.notes')}>{referral.notes}</Row>}
        </dl>
      </section>

      {issues.length > 0 && (
        <section className="card border-warn/40">
          <h2 className="mb-1 font-bold text-warn">{t('facility.unresolved')}</h2>
          <ul className="space-y-1">
            {issues.map((i, idx) => (
              <li key={idx}>• {t(i.key, i.params)}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{t('facility.actions')}</h2>
        {saved && (
          <p className="rounded-xl bg-ok-soft px-3 py-2 font-semibold text-ok" role="status">
            {t('facility.saved')}
          </p>
        )}
        {closed ? (
          <p className="text-muted">{t('facility.closedInfo')}</p>
        ) : (
          <>
            <div>
              <label htmlFor="fac-note" className="mb-1 block font-semibold">
                {t('facility.note')}
              </label>
              <textarea id="fac-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {f.response === 'none' && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act({ kind: 'acknowledged', text: msg() })} data-testid="fac-ack">
                  {t('facility.ack')}
                </button>
              )}
              {f.response !== 'accepted' && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act({ kind: 'accepted', text: msg() })} data-testid="fac-accept">
                  {t('facility.accept')}
                </button>
              )}
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act({ kind: 'info_requested', text: msg() })}>
                {t('facility.requestInfo')}
              </button>
              <button type="button" className="btn btn-secondary text-danger" disabled={busy} onClick={() => void act({ kind: 'declined', text: msg() })}>
                {t('facility.decline')}
              </button>
            </div>

            <div className="rounded-xl border border-line p-3">
              <label htmlFor="fac-date" className="mb-1 block font-semibold">
                {t('facility.scheduleDate')}
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input id="fac-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                <button type="button" className="btn btn-primary" disabled={busy || !date} onClick={() => void act({ kind: 'scheduled', date, text: msg() })} data-testid="fac-schedule">
                  {t('facility.schedule')}
                </button>
              </div>
            </div>

            {f.appointmentDate && (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act({ kind: 'attended', text: msg() })}>
                  {t('facility.markAttended')}
                </button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void act({ kind: 'not_attended', text: msg() })}>
                  {t('facility.markNotAttended')}
                </button>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-line p-3">
              <label className="tap flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={followUpRequired}
                  onChange={(e) => setFollowUpRequired(e.target.checked)}
                  className="!min-h-0 !w-6 h-6 accent-[var(--color-brand)]"
                />
                <span className="font-semibold">{t('facility.followUpRequired')}</span>
              </label>
              {followUpRequired && (
                <div>
                  <label htmlFor="fac-plan" className="mb-1 block font-semibold">
                    {t('facility.followUpPlan')}
                  </label>
                  <textarea id="fac-plan" rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} />
                </div>
              )}
              <button
                type="button"
                className="btn btn-accent btn-block"
                disabled={busy || (followUpRequired && !plan.trim())}
                onClick={() => void act({ kind: 'completed', followUpRequired, followUpPlan: plan.trim(), text: msg() })}
                data-testid="fac-complete"
              >
                {t('facility.markCompleted')}
              </button>
            </div>

            {note.trim() && (
              <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => void act({ kind: 'note', text: note.trim() })}>
                {t('facility.sendNote')}
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{t('facility.workerUpdates')}</h2>
        <Timeline referral={referral} followUps={followUps} facilityEvents={events} />
      </section>
    </div>
  );
}
