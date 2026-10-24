import { useState } from 'react';
import type { CaseRecord } from '../db/repo';
import type { CareTier } from '../db/types';
interface Props { caseRecord: CaseRecord | null; viewerTier?: CareTier | 'super_admin'; isOpen: boolean; onClose: () => void; }
export function AiSummaryModal({ caseRecord, isOpen, onClose }: Props) {
  const [copyStatus, setCopyStatus] = useState('');
  if (!isOpen || !caseRecord) return null;
  const { patient, referral } = caseRecord;
  const cbac = referral.screening?.cbac;
  const exam = referral.physicalExam;
  const reports = [...(referral.reports || []), ...(referral.biopsyReports || []), ...(referral.radiologyReports || [])];
  const bullets = [
    `${patient.name || 'Unnamed patient'} · ${patient.age ?? 'Age not recorded'} · ${patient.sex || 'Sex not recorded'} · ${patient.locality || 'Locality not recorded'}`,
    `Care module: ${(referral.tier || 'asha').toUpperCase()}, Unit ${(referral.unit || 'a').toUpperCase()}. Destination: ${referral.destinationFacility || 'Not assigned'}. Recorded priority: ${referral.urgency || 'Not recorded'}.`,
    cbac ? `CBAC Part A: ${cbac.partA.totalScore}/12. Recorded flags: ${[cbac.highRiskNcd && 'High NCD risk', cbac.symptomAlert && 'Symptom alert', cbac.tbSuspectAlert && 'TB screening alert'].filter(Boolean).join(', ') || 'None'}. PHQ-2 score: ${cbac.partD.totalScore}/6.` : 'CBAC assessment has not been recorded.',
    exam ? `Physical examination: BP ${exam.bpSystolic ?? '—'}/${exam.bpDiastolic ?? '—'} mmHg, pulse ${exam.pulseRate ?? '—'} bpm, SpO₂ ${exam.spo2 ?? '—'}%, BMI ${exam.bmi ?? '—'}. ${exam.generalFindings || 'General findings not recorded.'}` : 'Physical examination has not been recorded.',
    ...[exam?.systemicExam, exam?.oralCavityFindings, exam?.breastExamFindings, exam?.cervicalExamFindings].filter(Boolean).map(finding => `Recorded examination findings: ${finding}`),
    `Reports attached: ${reports.length} (${referral.reports?.length || 0} general, ${referral.biopsyReports?.length || 0} biopsy, ${referral.radiologyReports?.length || 0} radiology).`,
    ...reports.map(report => `${report.title}: ${report.findings || 'No findings entered. PDF contents have not been analyzed.'}`),
    ...(referral.dhNotes ? [`DH notes: ${referral.dhNotes}`] : []),
    ...(referral.tccNotes ? [`TCC notes: ${referral.tccNotes}`] : []),
    ...(referral.notes ? [`Handover notes: ${referral.notes}`] : []),
  ];
  const pending = [!cbac && 'Complete the CBAC assessment', referral.tier !== 'asha' && !exam && 'Record physical examination findings', referral.tier !== 'asha' && !reports.length && 'Attach available diagnostic reports', referral.tier === 'dh' && !referral.dhNotes && 'Add DH notes', referral.tier === 'tcc' && !referral.tccNotes && 'Add TCC notes'].filter(Boolean);
  return <div role="dialog" aria-modal="true" aria-labelledby="summary-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"><div className="bg-white rounded-2xl border border-teal-100 p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-5"><div className="flex justify-between items-start gap-4"><div><span className="eyebrow">CARELINK INTELLIGENCE</span><h2 id="summary-title" className="text-xl font-semibold mt-1">AI summary</h2><p className="text-xs text-slate-500 mt-2">Automated, rule-based summary of saved records. Review before using in a handover.</p></div><button aria-label="Close summary" onClick={onClose} className="text-slate-400">✕</button></div><div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-sm text-teal-800">{patient.name} · {patient.id}</div><ul className="space-y-3 text-sm text-slate-600">{bullets.map((bullet, i) => <li className="border-b border-slate-100 pb-3 whitespace-pre-wrap" key={i}>{bullet}</li>)}</ul>{!!pending.length && <div className="rounded-xl bg-sky-50 p-4"><h3 className="text-sm font-semibold text-sky-900">Documentation to complete</h3><ul className="mt-2 text-xs text-slate-600 space-y-2">{pending.map(item => <li key={String(item)}>• {item}</li>)}</ul></div>}<p className="text-xs text-slate-400">PDF content is not interpreted automatically. Attachment presence does not establish a diagnosis.</p><div className="flex justify-between gap-3 border-t border-slate-100 pt-4"><button className="btn btn-secondary text-xs" onClick={async () => { try { await navigator.clipboard.writeText(bullets.join('\n\n')); setCopyStatus('Copied'); } catch { setCopyStatus('Clipboard unavailable'); } }}>{copyStatus || 'Copy summary'}</button><button className="btn btn-primary text-xs" onClick={onClose}>Done</button></div></div></div>;
}
