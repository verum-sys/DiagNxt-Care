import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon } from '../../components/Icon';
import { listCases, type CaseRecord } from '../../db/repo';
import { useLive } from '../../db/useLive';
import type { CareTier, CareUnit, ReportAttachment } from '../../db/types';
import { ReportAttachmentModal } from '../../components/ReportAttachmentModal';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import { PhysicalExamNotesModal } from '../../components/PhysicalExamNotesModal';
import { TierReferralModal } from '../../components/TierReferralModal';
import { AiSummaryModal } from '../../components/AiSummaryModal';

export function TierModuleView() {
  const { tier: tierParam } = useParams<{ tier: CareTier }>();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const { user, switchUnit } = useAuth();
  const activeTier: CareTier = (tierParam as CareTier) || 'asha';

  const [activeUnit, setActiveUnit] = useState<CareUnit>(['a', 'b', 'c'].includes(query.get('unit') || '') ? query.get('unit') as CareUnit : user.unit);
  const [search, setSearch] = useState('');

  // Modals state
  const [activeCaseForAttachment, setActiveCaseForAttachment] = useState<{ id: string; category: 'general' | 'biopsy' | 'radiology' } | null>(null);
  const [activePdfPreview, setActivePdfPreview] = useState<{ attachment: ReportAttachment; patientName: string; patientId: string } | null>(null);
  const [activeCaseForExam, setActiveCaseForExam] = useState<{ caseRecord: CaseRecord } | null>(null);
  const [activeCaseForReferral, setActiveCaseForReferral] = useState<{ caseRecord: CaseRecord } | null>(null);
  const [activeCaseForAi, setActiveCaseForAi] = useState<{ caseRecord: CaseRecord } | null>(null);

  const { data: allCases = [] } = useLive(listCases, []);

  // Filter cases belonging to this tier and unit
  const tierCases = allCases.filter((c) => {
    const t = c.referral.tier || 'asha';
    const u = c.referral.unit || 'a';
    if (t !== activeTier) return false;
    if (activeUnit && u !== activeUnit) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.patient.name || '').toLowerCase();
      const id = (c.patient.id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    }
    return true;
  });

  const tierMeta: Record<CareTier, {
    name: string;
    level: string;
    gradient: string;
    units: { key: CareUnit; label: string }[];
    nextTierName?: string;
    features: string[];
  }> = {
    asha: {
      name: 'ASHA Grassroots Healthcare',
      level: 'Tier 1 · Community Screening',
      gradient: 'from-teal-500 via-teal-600 to-emerald-600',
      units: [
        { key: 'a', label: 'Bero Subcentre A' },
        { key: 'b', label: 'Rampur Village B' },
        { key: 'c', label: 'Mandar Sector C' },
      ],
      nextTierName: 'PHC',
      features: ['CBAC Form', 'Refer to next PHC', 'AI Summary'],
    },
    phc: {
      name: 'Primary Health Centre (PHC)',
      level: 'Tier 2 · Primary Medical Triage',
      gradient: 'from-sky-500 via-sky-600 to-blue-600',
      units: [
        { key: 'a', label: 'PHC Itki Unit A' },
        { key: 'b', label: 'PHC Bero Unit B' },
        { key: 'c', label: 'PHC Kanke Unit C' },
      ],
      nextTierName: 'DH',
      features: ['CBAC Form (editable)', 'Notes (Physical Examination)', 'Reports (PDF file attachment)', 'Refer to DH', 'AI Summary'],
    },
    dh: {
      name: 'District Hospital (DH)',
      level: 'Tier 3 · Secondary Diagnostic & Staging',
      gradient: 'from-cyan-600 via-teal-600 to-emerald-600',
      units: [
        { key: 'a', label: 'Sadar DH Ranchi Unit A' },
        { key: 'b', label: 'DH Khunti Unit B' },
        { key: 'c', label: 'DH Gumla Unit C' },
      ],
      nextTierName: 'TCC',
      features: ['CBAC Form (editable)', 'Notes (Physical Examination)', 'Reports (PDF file attachment)', 'Biopsy Report (PDF)', 'Radiology Report (PDF)', 'DH Notes', 'Refer to TCC', 'AI Summary'],
    },
    tcc: {
      name: 'Tertiary Care Centre (TCC)',
      level: 'Tier 4 · Advanced Oncology & MDT Protocols',
      gradient: 'from-emerald-600 via-teal-700 to-sky-700',
      units: [
        { key: 'a', label: 'RIMS Regional Cancer Centre A' },
        { key: 'b', label: 'State Cancer Institute B' },
        { key: 'c', label: 'Apex Oncology Centre C' },
      ],
      features: ['CBAC Form (editable)', 'Notes (Physical Examination)', 'Reports (PDF file attachment)', 'Biopsy Report (PDF)', 'Radiology Report (PDF)', 'TCC Notes', 'AI Summary'],
    },
  };

  if (!tierMeta[activeTier]) return <Navigate to="/" replace />;
  const currentMeta = tierMeta[activeTier];

  return (
    <div key={activeTier} className="tier-module space-y-5 max-w-6xl mx-auto pb-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900">
          <Icon name="back" size={16} />
          <span>Care network overview</span>
        </Link>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
          {currentMeta.level}
        </span>
      </div>

      {/* Module Hero Banner */}
      <div className={`rounded-2xl bg-gradient-to-r ${currentMeta.gradient} text-white p-6 shadow-lg border border-white/10 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-white/80 block">
              {activeTier.toUpperCase()} OPERATIONAL MODULE
            </span>
            <h1 className="text-2xl font-black font-display tracking-tight text-white mt-1">
              {currentMeta.name}
            </h1>
            <p className="text-xs text-white/85 max-w-2xl mt-1">
              Active facility workstation for conducting screenings, editing assessments, managing physical examination notes, diagnostic PDF reports, and care continuity.
            </p>
          </div>

          {/* Prominent "+ Add New CBAC Form" button */}
          <button
            type="button"
            onClick={() => navigate(`/cbac?tier=${activeTier}&unit=${activeUnit}`)}
            className="btn !min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold bg-white text-slate-900 hover:bg-slate-100 shadow-md flex items-center gap-2 active:scale-95 transition-all"
          >
            <Icon name="spark" size={16} className="text-teal-600" />
            <span>+ Add New CBAC Form</span>
          </button>
        </div>

        {/* Feature Pills */}
        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-white/70 uppercase">Enabled Capabilities:</span>
          {currentMeta.features.map((feat, i) => (
            <span
              key={i}
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/15 text-white backdrop-blur-sm border border-white/20"
            >
              ✓ {feat}
            </span>
          ))}
        </div>
      </div>

      {/* Sub-Unit Selector (a / b / c) */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Sub-Unit:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {currentMeta.units.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => {
                  setActiveUnit(u.key);
                  switchUnit(u.key);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeUnit === u.key
                    ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-400/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Unit {u.key.toUpperCase()}</span>
                <span className="ml-1 text-[11px] font-normal opacity-80">({u.label})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <input
            type="text"
            placeholder="Search patient in this unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs rounded-xl border border-slate-200 pl-8 pr-3 py-2 outline-none focus:border-sky-500"
          />
          <div className="absolute left-2.5 top-2.5 text-slate-400">
            <Icon name="spark" size={13} />
          </div>
        </div>
      </div>

      {/* Patient List in this Module */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-900 text-base flex items-center gap-2 font-display">
            <span>Patients at {currentMeta.name} (Unit {activeUnit.toUpperCase()})</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {tierCases.length} {tierCases.length === 1 ? 'case' : 'cases'}
            </span>
          </h2>

          <button
            type="button"
            onClick={() => navigate(`/cbac?tier=${activeTier}&unit=${activeUnit}`)}
            className="text-xs font-bold text-sky-700 hover:text-sky-800 underline flex items-center gap-1"
          >
            <Icon name="spark" size={13} />
            <span>+ Add New CBAC Form to this Unit</span>
          </button>
        </div>

        {tierCases.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-slate-400 text-sm">No patient cases currently in {currentMeta.name} Unit {activeUnit.toUpperCase()}.</p>
            <button
              type="button"
              onClick={() => navigate(`/cbac?tier=${activeTier}&unit=${activeUnit}`)}
              className="btn btn-primary !min-h-[40px] text-xs font-bold"
            >
              + Create First CBAC Screening for this Unit
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tierCases.map((c) => {
              const cbac = c.referral.screening?.cbac;
              const reportsCount = (c.referral.reports?.length || 0) + (c.referral.biopsyReports?.length || 0) + (c.referral.radiologyReports?.length || 0);

              return (
                <div
                  key={c.referral.id}
                  className="rounded-xl border border-slate-200 p-4 bg-slate-50/40 hover:bg-white transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center text-xs">
                        {c.patient.name ? c.patient.name.charAt(0) : 'P'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Link to={`/case/${c.referral.id}`} className="font-bold text-sm text-slate-900 hover:underline">
                            {c.patient.name}
                          </Link>
                          <span className="text-xs font-mono text-slate-400">({c.patient.id})</span>
                          {c.referral.urgency === 'urgent' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">
                              URGENT
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.patient.age ? `${c.patient.age}y` : ''} · {c.patient.locality || 'Locality unrecorded'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {cbac ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${cbac.highRiskNcd ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          CBAC Score: {cbac.partA.totalScore}/12
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                          CBAC Pending
                        </span>
                      )}
                      {reportsCount > 0 && (
                        <span className="text-xs font-bold text-sky-800 bg-sky-100 px-2 py-0.5 rounded-md">
                          {reportsCount} PDF Reports
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vitals snapshot if recorded */}
                  {c.referral.physicalExam && (
                    <div className="text-xs bg-white p-2 rounded-lg border border-slate-200 flex flex-wrap items-center gap-3 text-slate-700">
                      <span className="font-bold text-slate-500">Vitals:</span>
                      <span>BP: {c.referral.physicalExam.bpSystolic}/{c.referral.physicalExam.bpDiastolic} mmHg</span>
                      <span>Pulse: {c.referral.physicalExam.pulseRate} bpm</span>
                      <span>SpO2: {c.referral.physicalExam.spo2}%</span>
                      <span>BMI: {c.referral.physicalExam.bmi || '—'}</span>
                    </div>
                  )}

                  {/* Attached Reports previews */}
                  {reportsCount > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-400">Reports:</span>
                      {[
                        ...(c.referral.reports || []),
                        ...(c.referral.biopsyReports || []),
                        ...(c.referral.radiologyReports || []),
                      ].map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() =>
                            setActivePdfPreview({
                              attachment: att,
                              patientName: c.patient.name,
                              patientId: c.patient.id,
                            })
                          }
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 flex items-center gap-1"
                        >
                          <span className="uppercase text-[9px] font-bold px-1 bg-sky-200 rounded">
                            {att.category}
                          </span>
                          <span className="max-w-[120px] truncate">{att.title}</span>
                          <Icon name="info" size={11} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* CBAC Form */}
                      <Link
                        to={`/case/${c.referral.id}/cbac`}
                        className="btn !min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1"
                      >
                        <Icon name="spark" size={13} className="text-teal-600" />
                        <span>{activeTier === 'asha' ? (cbac ? 'View/Edit CBAC' : 'Conduct CBAC') : 'CBAC Form (editable)'}</span>
                      </Link>

                      {/* Physical Exam Notes */}
                      {activeTier !== 'asha' && (
                        <button
                          type="button"
                          onClick={() => setActiveCaseForExam({ caseRecord: c })}
                          className="btn !min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-1"
                        >
                          <Icon name="user" size={13} className="text-sky-600" />
                          <span>Notes (Physical Examination)</span>
                        </button>
                      )}

                      {(activeTier === 'dh' || activeTier === 'tcc') && <button type="button" onClick={() => setActiveCaseForExam({ caseRecord: c })} className="btn btn-secondary text-xs !min-h-[34px]">{activeTier.toUpperCase()} Notes</button>}
                      {/* PDF Reports Attachments */}
                      {activeTier !== 'asha' && (
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setActiveCaseForAttachment({ id: c.referral.id, category: 'general' })}
                            className="btn !min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                          >
                            + Reports (PDF)
                          </button>
                          {(activeTier === 'dh' || activeTier === 'tcc') && (
                            <>
                              <button
                                type="button"
                                onClick={() => setActiveCaseForAttachment({ id: c.referral.id, category: 'biopsy' })}
                                className="btn !min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                              >
                                + Biopsy Report (PDF)
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveCaseForAttachment({ id: c.referral.id, category: 'radiology' })}
                                className="btn !min-h-[34px] px-2 py-1 text-[11px] font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200"
                              >
                                + Radiology Report (PDF)
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* AI Summary */}
                      <button
                        type="button"
                        onClick={() => setActiveCaseForAi({ caseRecord: c })}
                        className="btn !min-h-[34px] px-3 py-1 text-xs font-bold rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-xs flex items-center gap-1"
                      >
                        <Icon name="spark" size={13} />
                        <span>AI Summary</span>
                      </button>

                      {/* Refer to Next Tier */}
                      {activeTier !== 'tcc' && (
                        <button
                          type="button"
                          onClick={() => setActiveCaseForReferral({ caseRecord: c })}
                          className="btn !min-h-[34px] px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1"
                        >
                          <span>
                            {activeTier === 'asha'
                              ? 'Refer to next PHC'
                              : activeTier === 'phc'
                              ? 'Refer to DH'
                              : 'Refer to TCC'}
                          </span>
                          <Icon name="back" size={13} className="rotate-180" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALS */}
      {activeCaseForAttachment && (
        <ReportAttachmentModal
          referralId={activeCaseForAttachment.id}
          category={activeCaseForAttachment.category}
          isOpen={true}
          onClose={() => setActiveCaseForAttachment(null)}
        />
      )}

      {activePdfPreview && (
        <PdfViewerModal
          attachment={activePdfPreview.attachment}
          patientName={activePdfPreview.patientName}
          patientId={activePdfPreview.patientId}
          isOpen={true}
          onClose={() => setActivePdfPreview(null)}
        />
      )}

      {activeCaseForExam && (
        <PhysicalExamNotesModal
          referralId={activeCaseForExam.caseRecord.referral.id}
          tier={activeTier}
          initialExam={activeCaseForExam.caseRecord.referral.physicalExam}
          initialDhNotes={activeCaseForExam.caseRecord.referral.dhNotes}
          initialTccNotes={activeCaseForExam.caseRecord.referral.tccNotes}
          isOpen={true}
          onClose={() => setActiveCaseForExam(null)}
        />
      )}

      {activeCaseForReferral && (
        <TierReferralModal
          referralId={activeCaseForReferral.caseRecord.referral.id}
          patientName={activeCaseForReferral.caseRecord.patient.name}
          currentTier={activeTier}
          isOpen={true}
          onClose={() => setActiveCaseForReferral(null)}
        />
      )}

      {activeCaseForAi && (
        <AiSummaryModal
          caseRecord={activeCaseForAi.caseRecord}
          viewerTier={activeTier}
          isOpen={true}
          onClose={() => setActiveCaseForAi(null)}
        />
      )}
    </div>
  );
}
