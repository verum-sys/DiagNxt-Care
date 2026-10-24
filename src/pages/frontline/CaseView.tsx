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
import type { CareTier, ReportAttachment } from '../../db/types';
import { ReportAttachmentModal } from '../../components/ReportAttachmentModal';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import { PhysicalExamNotesModal } from '../../components/PhysicalExamNotesModal';
import { TierReferralModal } from '../../components/TierReferralModal';
import { AiSummaryModal } from '../../components/AiSummaryModal';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 py-1.5 text-[0.88rem] sm:text-base">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold break-words max-w-full">{children}</dd>
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

  // Modals
  const [attachmentCat, setAttachmentCat] = useState<'general' | 'biopsy' | 'radiology' | null>(null);
  const [previewPdf, setPreviewPdf] = useState<ReportAttachment | null>(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

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

  const currentTier: CareTier = referral.tier || 'asha';
  const currentUnit = referral.unit || 'a';
  const reportsCount = (referral.reports?.length || 0) + (referral.biopsyReports?.length || 0) + (referral.radiologyReports?.length || 0);

  const tierColors: Record<CareTier, { label: string; bg: string; text: string }> = {
    asha: { label: 'ASHA Grassroots (Tier 1)', bg: 'bg-teal-50 border-teal-200', text: 'text-teal-800' },
    phc: { label: 'PHC Primary Health Centre (Tier 2)', bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800' },
    dh: { label: 'District Hospital DH (Tier 3)', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
    tcc: { label: 'Tertiary Care Centre TCC (Tier 4)', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800' },
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <BackLink to="/" />
        {/* AI Summary and Referral Buttons in top bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="btn !min-h-[36px] px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-xs flex items-center gap-1.5"
          >
            <Icon name="spark" size={14} />
            <span>AI Summary</span>
          </button>

          {currentTier !== 'tcc' && (
            <button
              type="button"
              onClick={() => setShowReferralModal(true)}
              className="btn !min-h-[36px] px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5"
            >
              <span>
                {currentTier === 'asha' ? 'Refer to next PHC' : currentTier === 'phc' ? 'Refer to DH' : 'Refer to TCC'}
              </span>
              <Icon name="back" size={14} className="rotate-180" />
            </button>
          )}
        </div>
      </div>

      {/* Tier & Continuum Header Banner */}
      <div className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${tierColors[currentTier].bg}`}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse" />
          <span className={`text-xs font-extrabold uppercase tracking-wider ${tierColors[currentTier].text}`}>
            {tierColors[currentTier].label} · Unit {currentUnit.toUpperCase()}
          </span>
        </div>
        <div className="text-xs text-slate-600 font-semibold">
          Facility: <span className="font-bold text-slate-800">{referral.destinationFacility || 'Local Sub-centre'}</span>
        </div>
      </div>

      {/* Patient Demographic Card */}
      <section className="card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[1.4rem] font-bold text-slate-900">{patient.name || '—'}</h1>
            <div className="text-muted text-sm">
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
              <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 text-sky-700 underline font-semibold">
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

      {/* Referral Details */}
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
            </>
          )}
          <Row label={t('case.referredBy')}>{referral.referringWorker}</Row>
          {referral.notes && <Row label={t('case.notes')}>{referral.notes}</Row>}
        </dl>
      </section>

      {/* CBAC Screening Section (Editable across all modules) */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Icon name="spark" size={20} className="text-accent" />
            <span>CBAC Assessment {currentTier !== 'asha' ? '(Editable)' : ''}</span>
          </h2>
          <Link
            to={`/case/${referral.id}/cbac`}
            className="btn btn-secondary !min-h-[36px] !px-3 text-xs sm:text-sm font-semibold flex items-center gap-1.5"
          >
            <Icon name="spark" size={14} className="text-teal-600" />
            <span>{referral.screening?.cbac ? 'Edit CBAC Form' : '+ Conduct CBAC Form'}</span>
          </Link>
        </div>

        {referral.screening?.cbac ? (
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl bg-surface border border-line">
                <span className="text-muted block text-xs">Part A NCD Score</span>
                <span className="font-bold text-base text-ink">
                  {referral.screening.cbac.partA.totalScore} / 12
                </span>
                <span
                  className={`block text-[0.72rem] font-bold mt-0.5 ${
                    referral.screening.cbac.highRiskNcd ? 'text-danger' : 'text-ok'
                  }`}
                >
                  {referral.screening.cbac.highRiskNcd ? 'High Risk (>4) · PHC Consultation Advised' : 'Routine Screening'}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-surface border border-line">
                <span className="text-muted block text-xs">Part D PHQ-2 Mental Score</span>
                <span className="font-bold text-base text-ink">
                  {referral.screening.cbac.partD.totalScore} / 6
                </span>
                <span
                  className={`block text-[0.72rem] font-bold mt-0.5 ${
                    referral.screening.cbac.partD.totalScore >= 3 ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {referral.screening.cbac.partD.totalScore >= 3 ? 'Refer for Counselor Review' : 'Normal Range'}
                </span>
              </div>
            </div>

            {referral.screening.cbac.tbSuspectAlert && (
              <div className="rounded-xl bg-danger-soft p-2.5 text-xs text-danger font-semibold flex items-center gap-1.5">
                <Icon name="alert" size={16} />
                <span>🚨 TB Suspect: Sputum collection & transport required</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted">
            No CBAC checklist recorded for this patient yet. Tap above to launch the slide-based checklist.
          </p>
        )}
      </section>

      {/* Notes (Physical Examination) Section */}
      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Icon name="user" size={20} className="text-sky-600" />
            <span>Notes (Physical Examination)</span>
          </h2>
          <button
            type="button"
            onClick={() => setShowExamModal(true)}
            className="btn btn-secondary !min-h-[36px] !px-3 text-xs sm:text-sm font-semibold flex items-center gap-1"
          >
            <span>{referral.physicalExam ? 'Edit Physical Exam' : '+ Record Physical Exam'}</span>
          </button>
        </div>

        {referral.physicalExam ? (
          <div className="space-y-3 text-xs sm:text-sm">
            {/* Vitals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Blood Pressure</span>
                <span className="font-bold text-slate-800 text-sm">
                  {referral.physicalExam.bpSystolic}/{referral.physicalExam.bpDiastolic} mmHg
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pulse Rate</span>
                <span className="font-bold text-slate-800 text-sm">{referral.physicalExam.pulseRate} bpm</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">SpO2 Level</span>
                <span className="font-bold text-slate-800 text-sm">{referral.physicalExam.spo2}%</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">BMI</span>
                <span className="font-bold text-slate-800 text-sm">{referral.physicalExam.bmi || '—'}</span>
              </div>
            </div>

            {/* Findings list */}
            <div className="space-y-1.5 text-xs text-slate-700">
              {referral.physicalExam.generalFindings && (
                <p><strong>General Examination:</strong> {referral.physicalExam.generalFindings}</p>
              )}
              {referral.physicalExam.systemicExam && (
                <p><strong>Systemic Examination:</strong> {referral.physicalExam.systemicExam}</p>
              )}
              {referral.physicalExam.oralCavityFindings && (
                <p><strong>Oral Cavity:</strong> {referral.physicalExam.oralCavityFindings}</p>
              )}
              {referral.physicalExam.breastExamFindings && (
                <p><strong>Breast / Cervical:</strong> {referral.physicalExam.breastExamFindings}</p>
              )}
              {referral.physicalExam.recordedBy && (
                <p className="text-[11px] text-slate-400 pt-1">Recorded by: {referral.physicalExam.recordedBy}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted">
            No physical examination recorded yet. Click above to log vitals, systemic, and local examination findings.
          </p>
        )}
      </section>

      {/* Reports (PDF File Attachments) Section */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Icon name="info" size={20} className="text-indigo-600" />
              <span>Diagnostic Reports (PDF Attachments)</span>
            </h2>
            <p className="text-xs text-slate-500">General lab, Biopsy (histopathology), and Radiology imaging reports</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAttachmentCat('general')}
              className="btn btn-secondary !min-h-[34px] !px-2.5 text-xs font-semibold"
            >
              + Lab PDF
            </button>
            <button
              type="button"
              onClick={() => setAttachmentCat('biopsy')}
              className="btn btn-secondary !min-h-[34px] !px-2.5 text-xs font-semibold text-amber-800 bg-amber-50"
            >
              + Biopsy PDF
            </button>
            <button
              type="button"
              onClick={() => setAttachmentCat('radiology')}
              className="btn btn-secondary !min-h-[34px] !px-2.5 text-xs font-semibold text-indigo-800 bg-indigo-50"
            >
              + Radiology PDF
            </button>
          </div>
        </div>

        {reportsCount > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              ...(referral.reports || []),
              ...(referral.biopsyReports || []),
              ...(referral.radiologyReports || []),
            ].map((att) => (
              <div
                key={att.id}
                onClick={() => setPreviewPdf(att)}
                className="p-3 rounded-xl border border-slate-200 hover:border-sky-400 hover:bg-sky-50/40 cursor-pointer transition-all flex items-start justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                      att.category === 'biopsy' ? 'bg-amber-100 text-amber-800' :
                      att.category === 'radiology' ? 'bg-indigo-100 text-indigo-800' :
                      'bg-sky-100 text-sky-800'
                    }`}>
                      {att.category}
                    </span>
                    <span className="text-xs text-slate-400">{att.fileSize}</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{att.title}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{att.findings || att.fileName}</p>
                </div>
                <div className="text-sky-600 text-xs font-bold shrink-0 mt-1">
                  View PDF →
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-muted">
            No diagnostic PDF reports attached yet. Use the buttons above to attach General Lab, Biopsy, or Radiology reports.
          </p>
        )}
      </section>

      {/* Tier Specific Notes (DH Notes / TCC Notes) */}
      {(referral.dhNotes || referral.tccNotes) && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Specialist Tier Notes</h2>
          {referral.dhNotes && (
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
              <span className="text-xs font-bold text-amber-900 uppercase">District Hospital (DH) Notes</span>
              <p className="text-xs text-amber-950 whitespace-pre-wrap">{referral.dhNotes}</p>
            </div>
          )}
          {referral.tccNotes && (
            <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
              <span className="text-xs font-bold text-rose-900 uppercase">Tertiary Care Centre (TCC) Notes</span>
              <p className="text-xs text-rose-950 whitespace-pre-wrap">{referral.tccNotes}</p>
            </div>
          )}
        </section>
      )}

      {/* Follow-up Action Link */}
      <Link to={`/case/${referral.id}/follow-up`} className="btn btn-primary btn-block !min-h-[52px] text-base font-bold shadow-md" role="button">
        {t('case.recordFollowUp')}
      </Link>

      {/* Timeline */}
      <section className="card">
        <h2 className="mb-3 text-lg font-bold">{t('case.timeline')}</h2>
        <Timeline referral={referral} followUps={followUps} facilityEvents={facilityEvents} syncEvents={syncEvents} />
      </section>

      {/* MODALS */}
      {attachmentCat && (
        <ReportAttachmentModal
          referralId={referral.id}
          category={attachmentCat}
          isOpen={true}
          onClose={() => setAttachmentCat(null)}
        />
      )}

      {previewPdf && (
        <PdfViewerModal
          attachment={previewPdf}
          patientName={patient.name}
          patientId={patient.id}
          isOpen={true}
          onClose={() => setPreviewPdf(null)}
        />
      )}

      {showExamModal && (
        <PhysicalExamNotesModal
          referralId={referral.id}
          tier={currentTier}
          initialExam={referral.physicalExam}
          initialDhNotes={referral.dhNotes}
          initialTccNotes={referral.tccNotes}
          isOpen={true}
          onClose={() => setShowExamModal(false)}
        />
      )}

      {showReferralModal && (
        <TierReferralModal
          referralId={referral.id}
          patientName={patient.name}
          currentTier={currentTier}
          isOpen={true}
          onClose={() => setShowReferralModal(false)}
        />
      )}

      {showAiModal && (
        <AiSummaryModal
          caseRecord={data}
          viewerTier={currentTier}
          isOpen={true}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}
