import type { ReportAttachment } from '../db/types';
import { Icon } from './Icon';

interface PdfViewerModalProps {
  attachment: ReportAttachment | null;
  patientName?: string;
  patientId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function PdfViewerModal({
  attachment,
  patientName = 'Patient Record',
  patientId = 'CL-0001',
  isOpen,
  onClose,
}: PdfViewerModalProps) {
  if (!isOpen || !attachment) return null;

  const handleDownload = () => {
    // Generate text/pdf simulation download
    const content = `DIAGNXT CLINICAL DIAGNOSTIC REPORT\n${'='.repeat(45)}\nPatient: ${patientName} (${patientId})\nDocument: ${attachment.title}\nCategory: ${attachment.category.toUpperCase()}\nFile: ${attachment.fileName}\nDate: ${new Date(attachment.uploadedAt).toLocaleString()}\n\nFINDINGS:\n${attachment.findings || 'No abnormal findings reported.'}\n\nDigitally Certified by DiagNXT Health Continuum`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.fileName.replace(/\.pdf$/, '') + '_diagnostic.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Document Header Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
              <Icon name="spark" size={20} />
            </div>
            <div>
              <div className="text-sm font-bold truncate max-w-md">{attachment.title}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>{attachment.fileName}</span>
                <span>•</span>
                <span>{attachment.fileSize}</span>
                <span>•</span>
                <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 font-bold">
                  {attachment.category}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
            >
              <span>Download</span>
              <Icon name="check" size={14} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Icon name="back" size={18} className="rotate-180" />
            </button>
          </div>
        </div>

        {/* Clinical Document Preview Sheet */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md border border-slate-200 p-8 space-y-6">
            {/* Hospital / Lab Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight font-display">
                  DIAGNXT CLINICAL & PATHOLOGY SERVICES
                </h1>
                <p className="text-xs text-slate-500 font-medium">Department of Advanced Diagnostics & Health Intelligence</p>
                <p className="text-[11px] text-slate-400">NABH & NABL Accredited Reference Laboratory</p>
              </div>
              <div className="text-right text-xs">
                <span className="font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200 inline-block">
                  REPORT REF: {attachment.id.toUpperCase()}
                </span>
                <div className="text-[11px] text-slate-400 mt-1">Date: {new Date(attachment.uploadedAt).toLocaleDateString()}</div>
              </div>
            </div>

            {/* Patient Demographics */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Patient Name</span>
                <span className="font-bold text-slate-800 text-sm">{patientName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Health ID (UHID)</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{patientId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Investigation</span>
                <span className="font-semibold text-slate-700">{attachment.title}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Report Category</span>
                <span className="font-semibold text-slate-700 uppercase">{attachment.category} (PDF ATTACHMENT)</span>
              </div>
            </div>

            {/* Diagnostic Findings */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1 flex items-center justify-between">
                <span>PATHOLOGICAL & DIAGNOSTIC OBSERVATIONS</span>
                <span className="text-[10px] text-emerald-600 font-semibold">✓ VERIFIED BY SENIOR PATHOLOGIST</span>
              </h3>

              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/90 text-sm leading-relaxed text-slate-800 font-mono whitespace-pre-wrap">
                {attachment.findings || (
                  <span className="text-slate-400 italic">
                    Certified high-resolution scan attached. Please refer to embedded pathology sheets for full histological plates and stained cytology smears.
                  </span>
                )}
              </div>
            </div>

            {/* Quality & Accreditation Seal */}
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                  ✓
                </div>
                <span>Electronically generated and cryptographically signed</span>
              </div>
              <div className="text-right">
                <div className="font-bold text-slate-700">Dr. S. K. Ramanathan, MD (Path)</div>
                <div className="text-[10px] text-slate-400">Chief Clinical Pathologist & Onco-Radiologist</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <div>DiagNXT Care Continuum · Portable Health Diagnostic Record</div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
