import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { Chip } from '../../components/StatusChip';
import { addFollowUp, getCase } from '../../db/repo';
import type { ActionKey, FacilityResponse, FollowUpAction, Intention } from '../../db/types';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { ACTION_MATCHES, analyze } from '../../intelligence/engine';

const OPTIONS: FollowUpAction[] = [
  'facility_contacted',
  'appointment_confirmed',
  'contacted_patient',
  'unable_to_reach',
  'patient_attended',
  'patient_not_attended',
  'rescheduled',
  'info_sent_to_facility',
  'outcome_recorded',
  'other',
];

export function RecordFollowUp() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLang();
  const { data } = useLive(() => getCase(id), [id]);

  // The suggestion comes from the URL (Take this action) or, if opened directly, from the engine.
  const suggested: ActionKey | undefined = useMemo(() => {
    const fromUrl = params.get('suggested') as ActionKey | null;
    if (fromUrl) return fromUrl;
    if (!data) return undefined;
    return analyze(data.patient, data.referral, data.followUps).action;
  }, [params, data]);
  const chooseDifferent = params.get('choose') === '1';
  const matches = suggested ? ACTION_MATCHES[suggested] : [];

  const ordered = useMemo(
    () => (chooseDifferent ? OPTIONS : [...OPTIONS.filter((o) => matches.includes(o)), ...OPTIONS.filter((o) => !matches.includes(o))]),
    [matches, chooseDifferent],
  );

  const [action, setAction] = useState<FollowUpAction | ''>('');
  const [date, setDate] = useState('');
  const [response, setResponse] = useState<FacilityResponse | ''>('');
  const [intention, setIntention] = useState<Intention | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const options = OPTIONS.filter((o) => matches.includes(o));
    if (!chooseDifferent && options.length === 1 && !action) setAction(options[0]);
  }, [matches, chooseDifferent, action]);

  const needsDate = action === 'appointment_confirmed' || action === 'rescheduled';
  const canSave = !!action && (!needsDate || !!date) && (action !== 'outcome_recorded' || !!note.trim()) && !saving;

  async function save() {
    if (!action) return;
    setSaving(true);
    try {
      await addFollowUp(id, {
        action,
        note: note.trim() || undefined,
        date: date || undefined,
        response: response || undefined,
        intention: intention || undefined,
        suggestedAction: suggested,
      });
      navigate(`/case/${id}`, { state: { toast: 'followup.saved' } });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <BackLink to={`/case/${id}`} />
      <div>
        <h1 className="text-[1.4rem] font-bold">{t('followup.title')}</h1>
        {data && (
          <p className="text-muted">
            {data.patient.name} · {data.patient.id}
          </p>
        )}
      </div>

      {suggested && suggested !== 'none' && (
        <p className="flex items-start gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-brand">
          <Icon name="spark" size={18} className="mt-0.5 text-accent" />
          <span>
            {t('followup.aiSuggested', { action: `action.${suggested}` })}
            <span className="block text-[0.85rem] italic">{t('reason.youDecide')}</span>
          </span>
        </p>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="card">
          <legend className="px-1 text-lg font-bold">{t('followup.what')}</legend>
          <div className="mt-2 space-y-2" role="radiogroup">
            {ordered.map((o) => (
              <label
                key={o}
                className={`tap flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 ${
                  action === o ? 'border-brand bg-brand/5' : 'border-line'
                }`}
              >
                <input type="radio" name="action" value={o} checked={action === o} onChange={() => setAction(o)} className="!min-h-0 !w-5 h-5 accent-[var(--color-brand)]" />
                <span className="flex-1 font-semibold">{t(`fu.${o}`)}</span>
                {matches.includes(o) && <Chip tone="info">{t('followup.suggested')}</Chip>}
              </label>
            ))}
          </div>
        </fieldset>

        {action === 'facility_contacted' && (
          <div className="card space-y-3">
            <label htmlFor="fu-resp" className="block font-semibold">
              {t('followup.facilitySaid')}
            </label>
            <select id="fu-resp" value={response} onChange={(e) => setResponse(e.target.value as FacilityResponse | '')}>
              <option value="">{t('followup.noAnswer')}</option>
              <option value="received">{t('response.received')}</option>
              <option value="accepted">{t('response.accepted')}</option>
              <option value="declined">{t('response.declined')}</option>
              <option value="info_requested">{t('response.info_requested')}</option>
            </select>
            <label htmlFor="fu-date" className="block font-semibold">
              {t('followup.date')}
            </label>
            <input id="fu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        {needsDate && (
          <div className="card">
            <label htmlFor="fu-date2" className="mb-1 block font-semibold">
              {action === 'rescheduled' ? t('followup.newDate') : t('followup.date')}
            </label>
            <input id="fu-date2" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        )}

        {action === 'contacted_patient' && (
          <div className="card">
            <label htmlFor="fu-int" className="mb-1 block font-semibold">
              {t('followup.patientSays')}
            </label>
            <select id="fu-int" value={intention} onChange={(e) => setIntention(e.target.value as Intention | '')}>
              <option value="">{t('form.unknown')}</option>
              <option value="will_attend">{t('intention.will_attend')}</option>
              <option value="unsure">{t('intention.unsure')}</option>
              <option value="will_not_attend">{t('intention.will_not_attend')}</option>
            </select>
          </div>
        )}

        <div className="card">
          <label htmlFor="fu-note" className="mb-1 block font-semibold">
            {action === 'outcome_recorded' ? t('followup.outcome') : t('followup.note')}
          </label>
          <textarea id="fu-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} required={action === 'outcome_recorded'} />
        </div>

        <button type="submit" className="btn btn-primary btn-block !min-h-[56px] text-lg" disabled={!canSave} data-testid="save-followup">
          {t('followup.save')}
        </button>
      </form>
    </div>
  );
}
