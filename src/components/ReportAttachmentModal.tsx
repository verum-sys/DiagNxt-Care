import React, { useState, useRef } from 'react';
import type { ReportAttachment } from '../db/types';
import { addCaseAttachment } from '../db/repo';
import { Icon } from './Icon';

interface ReportAttachmentModalProps {
  referralId: string;
  category: 'general' | 'biopsy' | 'radiology';
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function ReportAttachmentModal({
  referralId,
  category,
  isOpen,
  onClose,
  onSaved,
}: ReportAttachmentModalProps) {
  const [title, setTitle] = useState('');
  const [findings, setFindings] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [dataUrl, setDataUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const uploadVersion = useRef(0);

  if (!isOpen) return null;

  const categoryTitles = {
    general: 'General Clinical & Diagnostic Report (PDF)',
    biopsy: 'Biopsy / Histopathology Report (PDF)',
    radiology: 'Radiology / Diagnostic Imaging Report (PDF)',
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const version = ++uploadVersion.current;
    setDataUrl(''); setFileName(''); setError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 25 * 1024 * 1024) {
      setError('Choose a PDF file up to 25 MB.'); return;
    }
    setReading(true);
    try {
      const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
      if (version !== uploadVersion.current) return;
      if (signature !== '%PDF-') throw new Error('This file is not a valid PDF.');
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Could not read this PDF. Please try again.'));
        reader.readAsDataURL(file);
      });
      if (version !== uploadVersion.current) return;
      setDataUrl(result); setFileName(file.name);
      setFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
    } catch (err) { if (version === uploadVersion.current) setError(err instanceof Error ? err.message : 'Unable to read PDF.'); }
    finally { if (version === uploadVersion.current) setReading(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataUrl || reading) { setError('Choose a PDF before saving.'); return; }

    setSubmitting(true);
    try {
      const attachment: ReportAttachment = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: title.trim() || fileName || 'Clinical PDF Report',
        fileName: fileName || `${category}_report.pdf`,
        fileSize: fileSize || '1.5 MB',
        fileType: 'application/pdf',
        category,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'DiagNXT Clinical Portal',
        findings: findings.trim() || undefined,
        dataUrl,
      };

      await addCaseAttachment(referralId, attachment);
      onSaved?.();
      onClose();
    } catch { setError('The PDF could not be saved. Check device storage and try again.'); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                category === 'biopsy' ? 'bg-amber-100 text-amber-800' :
                category === 'radiology' ? 'bg-indigo-100 text-indigo-800' :
                'bg-sky-100 text-sky-800'
              }`}>
                {category.toUpperCase()} ATTACHMENT
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{categoryTitles[category]}</h2>
            <p className="text-xs text-slate-500">Attach and store certified diagnostic PDF documentation to patient file</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="back" size={20} className="rotate-180" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{reading && <p role="status" className="text-sm text-teal-700">Reading PDF…</p>}
          {/* File Upload Zone */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Select PDF File
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-sky-500 bg-slate-50/50 transition-colors">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="file-pdf-upload"
              />
              <label htmlFor="file-pdf-upload" className="cursor-pointer block">
                <div className="mx-auto h-10 w-10 text-sky-600 flex items-center justify-center bg-sky-50 rounded-full mb-2">
                  <Icon name="spark" size={20} />
                </div>
                {fileName ? (
                  <div>
                    <span className="text-sm font-bold text-slate-800">{fileName}</span>
                    <span className="block text-xs text-slate-500">{fileSize} · PDF Document</span>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-semibold text-sky-700 underline">Browse PDF document</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">PDF up to 25MB supported</span>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Report Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Report Title / Investigation Name
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Histopathology Biopsy Report #HP-4482"
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>

          {/* Clinical Findings / Highlights */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Diagnostic Summary & Key Clinical Findings
            </label>
            <textarea
              rows={3}
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Key pathological diagnosis, staging, impression, or abnormal values..."
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || reading || !dataUrl}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-sky-600 text-white shadow-md hover:bg-sky-700 disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Icon name="check" size={16} />
              <span>{submitting ? 'Attaching...' : 'Attach PDF to Case'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
