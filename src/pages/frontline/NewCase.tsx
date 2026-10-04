import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HighlightedTextarea, scrollToHighlightField } from '../../components/HighlightedTextarea';
import { BackLink } from '../../components/Layout';
import { Icon } from '../../components/Icon';
import { CareStateChip, CaseStageChip, FieldStatusChip } from '../../components/StatusChip';
import { makePatient, makeReferral } from '../../db/factory';
import { createCase, getCase, updateCase, type PatientDraft, type ReferralDraft } from '../../db/repo';
import type {
  ActionKey,
  DraftFieldKey,
  DraftFieldRow,
  FacilityResponse,
  Intention,
  ReferralRequiredAnswer,
  ScreeningArea,
  ScreeningFinding,
  Sex,
  Urgency,
} from '../../db/types';
import { useLang } from '../../i18n';
import { today } from '../../intelligence/dates';
import { analyze } from '../../intelligence/engine';
import {
  allDemoCaseTexts,
  DEMO_CASE_BY_LANG,
  DEMO_CASE_TEXT,
  DEMO_LANG_ORDER,
  demoTextForLang,
  type DemoLang,
} from '../../intelligence/demoCases';
import { parseFreeTextWithSpans, type FieldSpan, type ParsedCase, type ParsedField } from '../../intelligence/parser';
import { buildDraftFieldRows } from '../../intelligence/stage/draftFields';
import {
  CHECKLIST_LABEL,
  getStageExpectations,
  isChecklistItemComplete,
} from '../../intelligence/stage/deriveStage';
import { useSettings } from '../../settings';
import { useConnectivity } from '../../sync/connectivity';
import { useVoiceDictation, type DictationSampleKey } from '../../voice/useVoiceDictation';

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
  screeningCompleted: boolean;
  screeningArea: ScreeningArea | '';
  screeningFinding: ScreeningFinding | '';
  referralRequired: ReferralRequiredAnswer | '';
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
  screeningCompleted: false,
  screeningArea: '',
  screeningFinding: '',
  referralRequired: '',
};

function toDrafts(f: FormState, appointmentTentative: boolean): { p: PatientDraft; r: ReferralDraft } {
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
      appointmentCertainty:
        appointmentTentative && f.appointmentDate ? 'tentative' : undefined,
      screening:
        f.screeningCompleted || f.screeningArea || f.screeningFinding || f.referralRequired
          ? {
              completed: f.screeningCompleted,
              area: f.screeningArea || undefined,
              finding: f.screeningFinding || undefined,
              referralRequired: f.referralRequired || undefined,
            }
          : undefined,
    },
  };
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
  const [spans, setSpans] = useState<FieldSpan[]>([]);
  const [understoodText, setUnderstoodText] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [needsReunderstand, setNeedsReunderstand] = useState(false);
  const [notesLinked, setNotesLinked] = useState(true);
  const [highlightField, setHighlightField] = useState<ParsedField | null>(null);
  const [reviewDialogChecked, setReviewDialogChecked] = useState(false);
  const [appointmentTentative, setAppointmentTentative] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedSample, setSelectedSample] = useState<DictationSampleKey>(
    lang === 'hi' ? 'hindi' : 'en',
  );
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const describeHostRef = useRef<HTMLDivElement>(null);

  const {
    isListening,
    activeMode,
    toggle: toggleVoice,
  } = useVoiceDictation({
    lang,
    online,
    selectedSample,
    onTranscript: (spokenText) => {
      applyDescribeText(spokenText);
    },
    onComplete: (completedText) => {
      understand(completedText);
    },
  });

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
        screeningCompleted: r.screening?.completed ?? false,
        screeningArea: r.screening?.area ?? '',
        screeningFinding: r.screening?.finding ?? '',
        referralRequired: r.screening?.referralRequired ?? '',
      });
    });
  }, [id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function applyDescribeText(newText: string) {
    setText(newText);
    if (notesLinked) {
      setForm((f) => ({ ...f, notes: newText }));
    }
    if (understoodText !== null && newText !== understoodText) {
      setParsed(null);
      setSpans([]);
      setReviewed(false);
      setNeedsReunderstand(true);
    }
  }

  function understand(input = text) {
    const result = parseFreeTextWithSpans(input);
    const p = result.case;
    setText(result.text);
    setParsed(p);
    setSpans(result.spans);
    setUnderstoodText(result.text);
    setReviewed(false);
    setNeedsReunderstand(false);
    setNotesLinked(true);
    setAppointmentTentative(!!p.appointmentTentative);
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
      notes: result.text,
      facilityResponse: p.facilityAccepted ? 'accepted' : undefined,
      screeningCompleted: p.screeningCompleted ?? false,
      screeningArea: p.screeningArea ?? '',
      screeningFinding: p.screeningFinding ?? '',
      referralRequired: p.referralRequired ?? '',
    }));
  }


  // Live preview of what the Small AI will flag for this draft.
  const preview = useMemo(() => {
    if (!form.name && !parsed) return null;
    const { p, r } = toDrafts(form, appointmentTentative);
    const patient = makePatient({ id: 'draft', ...p });
    const referral = makeReferral({ id: 'draft', patientId: 'draft', ...r, worker: { appointmentDate: r.appointmentDate, facilityResponse: r.facilityResponse } });
    return analyze(patient, referral, []);
  }, [form, parsed, appointmentTentative]);

  async function save() {
    if (!form.name.trim()) {
      setError(t('new.nameRequired'));
      return;
    }
    setSaving(true);
    const { p, r } = toDrafts(form, appointmentTentative);
    try {
      if (editing && id) {
        await updateCase(id, p, r, suggested);
        navigate(`/case/${id}`, { state: { toast: 'status.savedLocally' } });
      } else {
        const newId = await createCase(p, r, workerName);
        navigate(`/case/${newId}`, { state: { toast: 'status.savedLocally', showStageSummary: true } });
      }
    } finally {
      setSaving(false);
    }
  }

  const describeInSync = parsed !== null && text === understoodText;
  const draftBundle = useMemo(() => {
    if (!parsed || !describeInSync) return null;
    return buildDraftFieldRows(text, parsed, form);
  }, [parsed, describeInSync, text, form]);
  const activeSpans = describeInSync ? spans : [];
  const isExampleText = allDemoCaseTexts().includes(text);

  function loadDemoForLang(demoLang: DemoLang) {
    const sample = demoTextForLang(demoLang);
    setText(sample);
    understand(sample);
  }

  function isDemoLangSelected(demoLang: DemoLang): boolean {
    return text === DEMO_CASE_TEXT[demoLang][DEMO_CASE_BY_LANG[demoLang]];
  }
  const canSaveNew =
    !editing && parsed !== null && reviewed && describeInSync && !needsReunderstand;

  function draftRowDisplay(row: DraftFieldRow): string | undefined {
    if (row.displayValueKey) return t(row.displayValueKey);
    if (row.key === 'referralDate' || row.key === 'appointmentDate') {
      return row.displayValue ? formatDate(row.displayValue) : undefined;
    }
    if (row.key === 'patientIntention' && row.displayValueKey) return t(row.displayValueKey);
    return row.displayValue;
  }

  const HIGHLIGHT_FIELDS = new Set<ParsedField>([
    'screeningCompleted',
    'screeningArea',
    'screeningFinding',
    'referralRequired',
    'name',
    'age',
    'phone',
    'locality',
    'destinationFacility',
    'referralDate',
    'reason',
    'urgency',
    'facilityResponse',
    'appointmentDate',
    'patientIntention',
  ]);

  function focusParsedField(k: DraftFieldKey) {
    if (!HIGHLIGHT_FIELDS.has(k as ParsedField)) return;
    const row = draftBundle?.rows.find((r) => r.key === k);
    if (!row || (row.status !== 'known' && row.status !== 'tentative')) return;
    setHighlightField(k as ParsedField);
    scrollToHighlightField(describeHostRef.current, k as ParsedField);
    window.setTimeout(() => setHighlightField(null), 2000);
  }

  function openReviewDialog() {
    setReviewDialogChecked(false);
    reviewDialogRef.current?.showModal();
  }

  function renderChecklist(titleKey: string, keys: DraftFieldKey[]) {
    if (!draftBundle || keys.length === 0) return null;
    const rowByKey = Object.fromEntries(draftBundle.rows.map((r) => [r.key, r]));
    return (
      <div>
        <h4 className="mb-1 text-[0.85rem] font-bold text-muted">{t(titleKey)}</h4>
        <ul className="space-y-1 text-[0.9rem]">
          {keys.map((k) => {
            const row = rowByKey[k];
            const done = row && isChecklistItemComplete(k, row.status);
            return (
              <li key={k} className="flex items-center gap-2">
                <Icon name={done ? 'check' : 'alert'} size={16} className={done ? 'text-ok' : 'text-muted'} />
                {t(CHECKLIST_LABEL[k])}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

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
          <div ref={describeHostRef}>
            <HighlightedTextarea
              id="describe"
              value={text}
              onChange={applyDescribeText}
              spans={activeSpans}
              rows={4}
              data-testid="describe"
              highlightField={highlightField}
            />
          </div>
          {needsReunderstand && text.trim() && (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-[0.9rem] font-semibold text-warn">{t('new.textChangedReunderstand')}</p>
          )}
          <div>
            <div className="mb-1 text-[0.85rem] font-semibold text-muted">{t('new.examples')}</div>
            <p className="mb-2 text-[0.85rem] text-muted">{t('new.examplesHint')}</p>
            <div className="flex flex-wrap gap-2" aria-label={t('new.examples')}>
              {DEMO_LANG_ORDER.map((demoLang) => {
                const selected = isDemoLangSelected(demoLang);
                return (
                  <button
                    key={demoLang}
                    type="button"
                    aria-pressed={selected}
                    className={`btn !min-h-[44px] text-[0.9rem] ${selected ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => loadDemoForLang(demoLang)}
                  >
                    {t(`new.example.${demoLang}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-accent !min-h-[46px] w-full text-[0.92rem] sm:text-base font-semibold"
              onClick={() => understand()}
              disabled={!text.trim() || isListening}
              data-testid="understand"
            >
              <Icon name="spark" size={18} />
              {t('new.understand')}
            </button>
            <button
              type="button"
              className={`btn ${isListening ? 'btn-danger' : 'btn-secondary'} !min-h-[46px] w-full text-[0.88rem] sm:text-base font-semibold flex items-center justify-center gap-1.5`}
              onClick={() => toggleVoice(selectedSample)}
              aria-pressed={isListening}
              data-testid="speak-button"
              title={!online ? t('new.micOfflineHint') : undefined}
            >
              <Icon
                name={isListening ? (activeMode === 'sample' ? 'speaker' : 'mic') : 'mic'}
                size={18}
                className={isListening ? 'animate-pulse text-danger' : ''}
              />
              <span className="truncate">
                {isListening
                  ? activeMode === 'sample'
                    ? t('new.micPlayingSample')
                    : t('new.micListening')
                  : !online
                    ? t('new.micOfflineDemo')
                    : t('new.mic')}
              </span>
              {!online && !isListening && (
                <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[0.68rem] font-bold text-brand uppercase tracking-wider">
                  Offline
                </span>
              )}
            </button>
          </div>
          {!online && (
            <p className="flex items-start sm:items-center gap-1.5 text-[0.8rem] sm:text-[0.85rem] text-muted">
              <Icon name="offline" size={15} className="mt-0.5 shrink-0 text-accent sm:mt-0" />
              <span>{t('new.micOfflineHint')}</span>
            </p>
          )}
          {parsed && describeInSync && (
            <div className="space-y-2">
              <button
                type="button"
                className={`btn btn-block ${reviewed ? 'btn-secondary' : 'btn-primary'}`}
                disabled={reviewed}
                onClick={() => setReviewed(true)}
                data-testid="mark-reviewed"
              >
                {reviewed ? t('new.reviewed') : t('new.markReviewed')}
              </button>
            </div>
          )}
        </section>
      )}

      {draftBundle && (
        <section className="card space-y-3 border-accent/50" aria-live="polite" data-testid="understood">
          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-bold text-brand">
              <Icon name="spark" size={18} className="text-accent" />
              {t('new.understood')}
            </h2>
            <p className="text-[0.85rem] text-muted">{t('new.understoodHint')}</p>
          </div>
          <CaseStageChip stage={draftBundle.stage} />
          {draftBundle.stage === 'referral_initiated' && (
            <p className="text-[0.9rem] text-brand">
              <span className="font-semibold">{t('draft.nextExpected')}: </span>
              {t('draft.nextFacilityConfirmation')}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            {draftBundle.rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-2 border-b border-line/70 py-1.5 text-[0.85rem] sm:text-[0.9rem]">
                <span className="text-muted min-w-0">{t(row.labelKey)}</span>
                <span className="text-right shrink-0">
                  {(row.status === 'known' || row.status === 'tentative') && draftRowDisplay(row) ? (
                    <button
                      type="button"
                      className="font-semibold text-brand underline-offset-2 hover:underline"
                      onClick={() => focusParsedField(row.key)}
                    >
                      {draftRowDisplay(row)}
                    </button>
                  ) : row.displayValueKey && row.status !== 'unknown' ? (
                    <span className="font-semibold">{t(row.displayValueKey)}</span>
                  ) : null}
                  <span className="ml-1 inline-block">
                    <FieldStatusChip status={row.status} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {renderChecklist('draft.checklist.complete', getStageExpectations(draftBundle.stage).complete)}
            {renderChecklist('draft.checklist.pending', getStageExpectations(draftBundle.stage).pending)}
            {renderChecklist('draft.checklist.notApplicable', getStageExpectations(draftBundle.stage).notApplicable)}
          </div>
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
          if (editing) {
            void save();
            return;
          }
          if (!canSaveNew) return;
          openReviewDialog();
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
          <legend className="px-1 text-lg font-bold">{t('new.screeningSection')}</legend>
          <p className="text-[0.9rem] text-muted">{t('new.screeningSectionHint')}</p>
          <label className="flex cursor-pointer items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="!min-h-0 !w-auto"
              checked={form.screeningCompleted}
              onChange={(e) => set('screeningCompleted', e.target.checked)}
            />
            {t('form.screeningCompleted')}
          </label>
          <Field label={t('form.screeningArea')} htmlFor="f-screen-area">
            <select
              id="f-screen-area"
              value={form.screeningArea}
              onChange={(e) => set('screeningArea', e.target.value as ScreeningArea | '')}
            >
              <option value="">{t('form.select')}</option>
              {(['oral', 'breast', 'cervical', 'ncd'] as ScreeningArea[]).map((a) => (
                <option key={a} value={a}>
                  {t(`screening.area.${a}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('form.screeningFinding')} htmlFor="f-screen-finding">
            <select
              id="f-screen-finding"
              value={form.screeningFinding}
              onChange={(e) => set('screeningFinding', e.target.value as ScreeningFinding | '')}
            >
              <option value="">{t('form.select')}</option>
              {(['positive', 'negative', 'needs_review'] as ScreeningFinding[]).map((f) => (
                <option key={f} value={f}>
                  {t(`screening.finding.${f}`)}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <div className="mb-1 font-semibold">{t('form.referralRequired')}</div>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('form.referralRequired')}>
              {(['yes', 'no'] as ReferralRequiredAnswer[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={form.referralRequired === v}
                  onClick={() => set('referralRequired', v)}
                  className={`btn ${form.referralRequired === v ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {t(`referralRequired.${v}`)}
                </button>
              ))}
            </div>
          </div>
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
            <textarea
              id="f-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => {
                setNotesLinked(false);
                set('notes', e.target.value);
              }}
            />
            {!editing && notesLinked && form.notes === text && (
              <p className="mt-1 text-[0.85rem] text-muted">{t('new.notesLinkedHint')}</p>
            )}
          </Field>
        </fieldset>

        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 font-semibold text-danger">{error}</p>}

        {!editing && !canSaveNew && (
          <p className="rounded-xl bg-info-soft px-3 py-2 text-[0.9rem] text-brand">{t('new.reviewRequired')}</p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block !min-h-[56px] text-lg"
          disabled={saving || (!editing && !canSaveNew)}
          data-testid="save-case"
        >
          {editing ? t('new.saveEdit') : t('new.save')}
        </button>
        <p className="text-center text-[0.85rem] text-muted">{t('status.offlineNote')}</p>
      </form>

      {!editing && (
        <dialog ref={reviewDialogRef} className="review-dialog">
          <h2 className="text-lg font-bold text-brand">{t('new.reviewDialogTitle')}</h2>
          <p className="mt-2 text-[0.9rem] text-muted">{t('new.reviewDialogHint')}</p>
          {isExampleText && (
            <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[0.9rem] font-semibold text-warn">{t('new.isExampleWarning')}</p>
          )}
          <div className="mt-3">
            <HighlightedTextarea value={text} onChange={() => {}} spans={activeSpans} readOnly rows={3} />
          </div>
          {draftBundle && (
            <ul className="mt-3 space-y-1 text-[0.9rem]">
              {draftBundle.rows
                .filter((row) => row.status === 'known' || row.status === 'tentative')
                .map((row) => (
                  <li key={row.key} className="flex justify-between gap-2 border-b border-line/60 py-1">
                    <span className="text-muted">{t(row.labelKey)}</span>
                    <span className="font-semibold">{draftRowDisplay(row)}</span>
                  </li>
                ))}
            </ul>
          )}
          <label className="mt-4 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="!min-h-0 mt-1 !w-auto"
              checked={reviewDialogChecked}
              onChange={(e) => setReviewDialogChecked(e.target.checked)}
            />
            <span>{t('new.reviewConfirmCheckbox')}</span>
          </label>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" className="btn btn-secondary" onClick={() => reviewDialogRef.current?.close()}>
              {t('new.reviewCancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!reviewDialogChecked || saving}
              onClick={() => {
                reviewDialogRef.current?.close();
                void save();
              }}
            >
              {t('new.reviewConfirmSave')}
            </button>
          </div>
        </dialog>
      )}
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
