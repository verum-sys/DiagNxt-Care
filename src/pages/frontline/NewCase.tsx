import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { CareStateChip, Chip } from '../../components/StatusChip';
import { makePatient, makeReferral } from '../../db/factory';
import { createCase, getCase, updateCase, type PatientDraft, type ReferralDraft } from '../../db/repo';
import type { ActionKey, FacilityResponse, Intention, Sex, Urgency } from '../../db/types';
import { useLang } from '../../i18n';
import { today } from '../../intelligence/dates';
import { analyze } from '../../intelligence/engine';
import { EXAMPLES, PARSED_FIELDS, fieldStates, parseFreeText, type ParsedCase } from '../../intelligence/parser';
import { useSettings } from '../../settings';
import { useConnectivity } from '../../sync/connectivity';

const FACILITY_SUGGESTIONS = [
  'Sadar District Hospital',
  'CHC Bero',
  'PHC Itki',
  'RIMS Medical College Hospital',
  'District Hospital',
  'Community Health Centre (CHC)',
  'Primary Health Centre (PHC)',
];

interface FormState {
  name: string;
  age: string;
  sex: Sex | '';
  phone: string;
  locality: string;
  reason: string;
  destinationFacility: string;
  referralDate: string;
  urgency: Urgency;
  appointmentDate: string;
  patientIntention: Intention | '';
  notes: string;
  facilityResponse?: FacilityResponse;
}

const EMPTY: FormState = {
  name: '',
  age: '',
  sex: '',
  phone: '',
  locality: '',
  reason: '',
  destinationFacility: '',
  referralDate: today(),
  urgency: 'routine',
  appointmentDate: '',
  patientIntention: '',
  notes: '',
};

function toDrafts(f: FormState): { p: PatientDraft; r: ReferralDraft } {
  return {
    p: {
      name: f.name.trim(),
      age: f.age ? Number(f.age) : undefined,
      sex: f.sex || undefined,
      phone: f.phone.trim() || undefined,
      locality: f.locality.trim() || undefined,
    },
    r: {
      reason: f.reason.trim(),
      destinationFacility: f.destinationFacility.trim(),
      referralDate: f.referralDate,
      urgency: f.urgency,
      notes: f.notes.trim(),
      patientIntention: f.patientIntention || undefined,
      appointmentDate: f.appointmentDate || undefined,
      facilityResponse: f.facilityResponse,
    },
  };
}

// Minimal typing for the Web Speech API (not in TS DOM lib).
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
function getSpeechRecognition(): (new () => SpeechRec) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function NewCase() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = !!id;
  const suggested = (params.get('suggested') as ActionKey | null) ?? undefined;
  const navigate = useNavigate();
  const { t, lang, formatDate } = useLang();
  const { workerName } = useSettings();
  const { online } = useConnectivity();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedCase | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const SR = getSpeechRecognition();

  useEffect(() => {
    if (!id) return;
    void getCase(id).then((c) => {
      if (!c) return;
      const { patient: p, referral: r } = c;
      setForm({
        name: p.name,
        age: p.age?.toString() ?? '',
        sex: p.sex ?? '',
        phone: p.phone ?? '',
        locality: p.locality ?? '',
        reason: r.reason,
        destinationFacility: r.destinationFacility,
        referralDate: r.referralDate,
        urgency: r.urgency,
        appointmentDate: r.worker.appointmentDate ?? '',
        patientIntention: r.patientIntention ?? '',
        notes: r.notes,
      });
    });
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function understand(input = text) {
    const p = parseFreeText(input);
    setParsed(p);
    setForm((f) => ({
      ...f,
      name: p.name ?? f.name,
      age: p.age?.toString() ?? f.age,
      sex: p.sex ?? f.sex,
      phone: p.phone ?? f.phone,
      locality: p.locality ?? f.locality,
      reason: p.reason ?? f.reason,
      destinationFacility: p.destinationFacility ?? f.destinationFacility,
      referralDate: p.referralDate ?? f.referralDate,
      urgency: p.urgency ?? f.urgency,
      appointmentDate: p.appointmentDate ?? f.appointmentDate,
      patientIntention: p.patientIntention ?? f.patientIntention,
      notes: f.notes || input,
      facilityResponse: p.facilityAccepted ? 'accepted' : undefined,
    }));
  }

  function toggleMic() {
    if (!SR || !online) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      setText((prev) => (prev ? `${prev} ${said}` : said));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  // Live preview of what the Small AI will flag for this draft.
  const preview = useMemo(() => {
    if (!form.name && !parsed) return null;
    const { p, r } = toDrafts(form);
    const patient = makePatient({ id: 'draft', ...p });
    const referral = makeReferral({ id: 'draft', patientId: 'draft', ...r, worker: { appointmentDate: r.appointmentDate, facilityResponse: r.facilityResponse } });
    return analyze(patient, referral, []);
  }, [form, parsed]);

  async function save() {
    if (!form.name.trim()) {
      setError(t('new.nameRequired'));
      return;
    }
    setSaving(true);
    const { p, r } = toDrafts(form);
    try {
      if (editing && id) {
        await updateCase(id, p, r, suggested);
        navigate(`/case/${id}`, { state: { toast: 'status.savedLocally' } });
      } else {
        const newId = await createCase(p, r, workerName);
        navigate(`/case/${newId}`, { state: { toast: 'status.savedLocally' } });
      }
    } finally {
      setSaving(false);
    }
  }

  const states = parsed ? fieldStates(parsed) : null;
  const parsedValue = (k: (typeof PARSED_FIELDS)[number]): string | undefined => {
    if (!parsed) return undefined;
    switch (k) {
      case 'referralDate':
      case 'appointmentDate':
        return parsed[k] ? formatDate(parsed[k]) : undefined;
      case 'urgency':
        return parsed.urgency ? t(`urgency.${parsed.urgency}`) : undefined;
      case 'patientIntention':
        return parsed.patientIntention ? t(`intention.${parsed.patientIntention}`) : undefined;
      case 'facilityResponse':
        return parsed.facilityAccepted ? t('response.accepted') : undefined;
      case 'attendance':
        return undefined;
      default:
        return parsed[k]?.toString();
    }
  };

  return (
    <div className="space-y-4">
      <BackLink to={editing ? `/case/${id}` : '/'} />
      <h1 className="text-[1.4rem] font-bold">{editing ? t('new.editTitle') : t('new.title')}</h1>

      {editing && suggested && (
        <p className="flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-2 text-brand">
          <Icon name="spark" size={16} className="text-accent" />
          {t('followup.aiSuggested', { action: `action.${suggested}` })}
        </p>
      )}

      {!editing && (
        <section className="card space-y-3">
          <label htmlFor="describe" className="block text-lg font-bold">
            {t('new.describe')}
          </label>
          <p className="text-[0.9rem] text-muted">{t('new.describeHint')}</p>
          <textarea id="describe" value={text} onChange={(e) => setText(e.target.value)} rows={4} data-testid="describe" />
          <div>
            <div className="mb-1 text-[0.85rem] font-semibold text-muted">{t('new.examples')}</div>
            <div className="flex flex-wrap gap-2">
              {(['en', 'hinglish', 'hindi'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn-secondary !min-h-[44px] text-[0.9rem]"
                  onClick={() => {
                    setText(EXAMPLES[k]);
                    understand(EXAMPLES[k]);
                  }}
                >
                  {t(`new.example.${k}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" className="btn btn-accent" onClick={() => understand()} disabled={!text.trim()} data-testid="understand">
              <Icon name="spark" size={18} />
              {t('new.understand')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={toggleMic}
              disabled={!SR || !online}
              aria-pressed={listening}
              title={!online ? t('new.micOffline') : !SR ? t('new.micUnsupported') : undefined}
            >
              <Icon name="mic" size={18} className={listening ? 'animate-pulse text-danger' : ''} />
              {listening ? t('new.micListening') : t('new.mic')}
            </button>
          </div>
          {(!online || !SR) && <p className="text-[0.85rem] text-muted">{!online ? t('new.micOffline') : t('new.micUnsupported')}</p>}
        </section>
      )}

      {parsed && states && (
        <section className="card space-y-3 border-accent/50" aria-live="polite" data-testid="understood">
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-bold text-brand">
              <Icon name="spark" size={18} className="text-accent" />
              {t('new.understood')}
            </h2>
            <p className="text-[0.85rem] text-muted">{t('new.understoodHint')}</p>
          </div>
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {PARSED_FIELDS.map((k) => (
              <li key={k} className="flex items-center justify-between gap-2 border-b border-line/70 py-1.5">
                <span className="text-muted">{t(`parsed.${k}`)}</span>
                {states[k] === 'known' ? (
                  <span className="text-right font-semibold">{parsedValue(k)}</span>
                ) : (
                  <Chip tone="warn">{t('factState.unknown')}</Chip>
                )}
              </li>
            ))}
          </ul>
          {preview && preview.action !== 'none' && (
            <div className="rounded-xl bg-warn-soft p-3" data-testid="gap-preview">
              <div className="flex items-center gap-1.5 font-bold text-warn">
                <Icon name="alert" size={18} />
                {t('new.gap')}
              </div>
              <div className="mt-1">
                <CareStateChip state={preview.careState} />
              </div>
              <p className="mt-1">{t(preview.reason.key, preview.reason.params)}</p>
              <p className="mt-1 font-semibold text-brand">
                {t('intel.suggested')}: {t(`action.${preview.action}`)}
              </p>
            </div>
          )}
        </section>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="card space-y-3">
          <legend className="px-1 text-lg font-bold">{t('new.patientSection')}</legend>
          <Field label={t('form.name')} htmlFor="f-name">
            <input id="f-name" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.age')} htmlFor="f-age">
              <input id="f-age" type="number" inputMode="numeric" min={0} max={120} value={form.age} onChange={(e) => set('age', e.target.value)} />
            </Field>
            <Field label={t('form.sex')} htmlFor="f-sex">
              <select id="f-sex" value={form.sex} onChange={(e) => set('sex', e.target.value as Sex | '')}>
                <option value="">{t('form.select')}</option>
                <option value="F">{t('sex.F')}</option>
                <option value="M">{t('sex.M')}</option>
                <option value="O">{t('sex.O')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('form.phone')} htmlFor="f-phone">
            <input id="f-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('form.locality')} htmlFor="f-loc">
            <input id="f-loc" value={form.locality} onChange={(e) => set('locality', e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="card space-y-3">
          <legend className="px-1 text-lg font-bold">{t('new.referralSection')}</legend>
          <Field label={t('form.reason')} htmlFor="f-reason">
            <input id="f-reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </Field>
          <Field label={t('form.destination')} htmlFor="f-dest">
            <input id="f-dest" list="facilities" value={form.destinationFacility} onChange={(e) => set('destinationFacility', e.target.value)} />
            <datalist id="facilities">
              {FACILITY_SUGGESTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label={t('form.referralDate')} htmlFor="f-date">
            <input id="f-date" type="date" value={form.referralDate} onChange={(e) => set('referralDate', e.target.value)} required />
          </Field>
          <div>
            <div className="mb-1 font-semibold">{t('form.urgency')}</div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('form.urgency')}>
              {(['routine', 'soon', 'urgent'] as Urgency[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={form.urgency === u}
                  onClick={() => set('urgency', u)}
                  className={`btn ${form.urgency === u ? (u === 'urgent' ? 'bg-danger text-white' : 'btn-primary') : 'btn-secondary'}`}
                >
                  {t(`urgency.${u}`)}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('form.appointment')} htmlFor="f-appt">
            <input id="f-appt" type="date" value={form.appointmentDate} onChange={(e) => set('appointmentDate', e.target.value)} />
          </Field>
          <Field label={t('form.intention')} htmlFor="f-int">
            <select id="f-int" value={form.patientIntention} onChange={(e) => set('patientIntention', e.target.value as Intention | '')}>
              <option value="">{t('form.unknown')}</option>
              <option value="will_attend">{t('intention.will_attend')}</option>
              <option value="unsure">{t('intention.unsure')}</option>
              <option value="will_not_attend">{t('intention.will_not_attend')}</option>
            </select>
          </Field>
          <Field label={t('form.notes')} htmlFor="f-notes">
            <textarea id="f-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </fieldset>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 font-semibold text-danger">{error}</p>}

        <button type="submit" className="btn btn-primary btn-block !min-h-[56px] text-lg" disabled={saving} data-testid="save-case">
          {editing ? t('new.saveEdit') : t('new.save')}
        </button>
        <p className="text-center text-[0.85rem] text-muted">{t('status.offlineNote')}</p>
      </form>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}
