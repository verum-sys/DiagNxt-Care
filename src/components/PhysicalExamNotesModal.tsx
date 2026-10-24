import React, { useState } from 'react';
import type { CareTier, PhysicalExamNotes } from '../db/types';
import { updateCaseClinical } from '../db/repo';
import { Icon } from './Icon';

interface PhysicalExamNotesModalProps {
  referralId: string;
  tier: CareTier;
  initialExam?: PhysicalExamNotes;
  initialDhNotes?: string;
  initialTccNotes?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function PhysicalExamNotesModal({
  referralId,
  tier,
  initialExam,
  initialDhNotes = '',
  initialTccNotes = '',
  isOpen,
  onClose,
  onSaved,
}: PhysicalExamNotesModalProps) {
  const [bpSys, setBpSys] = useState<string>(initialExam?.bpSystolic ? String(initialExam.bpSystolic) : '');
  const [bpDia, setBpDia] = useState<string>(initialExam?.bpDiastolic ? String(initialExam.bpDiastolic) : '');
  const [pulse, setPulse] = useState<string>(initialExam?.pulseRate ? String(initialExam.pulseRate) : '');
  const [spo2, setSpo2] = useState<string>(initialExam?.spo2 ? String(initialExam.spo2) : '98');
  const [temp, setTemp] = useState<string>(initialExam?.temperature ? String(initialExam.temperature) : '');
  const [weight, setWeight] = useState<string>(initialExam?.weightKg ? String(initialExam.weightKg) : '');
  const [height, setHeight] = useState<string>(initialExam?.heightCm ? String(initialExam.heightCm) : '');

  const [generalFindings, setGeneralFindings] = useState(
    initialExam?.generalFindings || ''
  );
  const [systemicExam, setSystemicExam] = useState(
    initialExam?.systemicExam || ''
  );
  const [oralCavityFindings, setOralCavityFindings] = useState(
    initialExam?.oralCavityFindings || ''
  );
  const [breastExamFindings, setBreastExamFindings] = useState(
    initialExam?.breastExamFindings || ''
  );
  const [cervicalExamFindings, setCervicalExamFindings] = useState(
    initialExam?.cervicalExamFindings || ''
  );

  const [dhNotes, setDhNotes] = useState(
    initialDhNotes || ''
  );
  const [tccNotes, setTccNotes] = useState(
    initialTccNotes || ''
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const w = parseFloat(weight);
      const h = parseFloat(height);
      const bmi = w && h ? parseFloat((w / Math.pow(h / 100, 2)).toFixed(1)) : undefined;

      const physicalExam: PhysicalExamNotes = {
        bpSystolic: bpSys ? parseInt(bpSys, 10) : undefined,
        bpDiastolic: bpDia ? parseInt(bpDia, 10) : undefined,
        pulseRate: pulse ? parseInt(pulse, 10) : undefined,
        spo2: spo2 ? parseInt(spo2, 10) : undefined,
        temperature: temp ? parseFloat(temp) : undefined,
        weightKg: w || undefined,
        heightCm: h || undefined,
        bmi,
        generalFindings: generalFindings.trim() || undefined,
        systemicExam: systemicExam.trim() || undefined,
        oralCavityFindings: oralCavityFindings.trim() || undefined,
        breastExamFindings: breastExamFindings.trim() || undefined,
        cervicalExamFindings: cervicalExamFindings.trim() || undefined,
        recordedAt: new Date().toISOString(),
        recordedBy: `Medical Officer / Specialist (${tier.toUpperCase()})`,
      };

      await updateCaseClinical(referralId, {
        physicalExam,
        ...(tier === 'dh' || tier === 'tcc' ? { dhNotes: dhNotes.trim() } : {}),
        ...(tier === 'tcc' ? { tccNotes: tccNotes.trim() } : {}),
      });

      onSaved?.();
      onClose();
    } catch { setError('Notes could not be saved. Please try again.'); } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800">
                {tier.toUpperCase()} CLINICAL EXAMINATION
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-1 font-display">Notes (Physical Examination)</h2>
            <p className="text-xs text-slate-500">Record baseline vitals, systemic evaluation, and tier-specific medical notes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="back" size={20} className="rotate-180" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Vitals Grid */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <span>Vital Signs & Anthropometry</span>
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">BP Systolic</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={bpSys}
                    onChange={(e) => setBpSys(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                    placeholder="120"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">mmHg</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">BP Diastolic</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={bpDia}
                    onChange={(e) => setBpDia(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                    placeholder="80"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">mmHg</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Pulse Rate</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                    placeholder="72"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">bpm</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">SpO2 Level</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                    placeholder="98"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">%</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Weight (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                  placeholder="65"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Height (cm)</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                  placeholder="165"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Body Temp</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    step="0.1"
                    value={temp}
                    onChange={(e) => setTemp(e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 px-2.5 py-1.5"
                    placeholder="98.6"
                  />
                  <span className="text-[10px] text-slate-400 ml-1">°F</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600">Calculated BMI</label>
                <div className="text-sm font-bold text-slate-800 py-1.5">
                  {weight && height
                    ? (parseFloat(weight) / Math.pow(parseFloat(height) / 100, 2)).toFixed(1)
                    : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Examination Notes */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-t border-slate-100 pt-3">
              Detailed Clinical Examination
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                General Physical Examination (Pallor, Icterus, Cyanosis, Lymphadenopathy, Edema)
              </label>
              <textarea
                rows={2}
                value={generalFindings}
                onChange={(e) => setGeneralFindings(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Systemic Examination (Chest / CVS / Abdomen / CNS)
              </label>
              <textarea
                rows={2}
                value={systemicExam}
                onChange={(e) => setSystemicExam(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Oral Cavity Examination (Lesions / Leukoplakia)
                </label>
                <textarea
                  rows={2}
                  value={oralCavityFindings}
                  onChange={(e) => setOralCavityFindings(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Breast / Cervical Local Examination
                </label>
                <textarea
                  rows={2}
                  value={breastExamFindings}
                  onChange={(e) => setBreastExamFindings(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          <div><label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="cervical-exam">Cervical examination findings</label><textarea id="cervical-exam" value={cervicalExamFindings} onChange={e => setCervicalExamFindings(e.target.value)} /></div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {/* Tier Specific Notes */}
          {(tier === 'dh' || tier === 'tcc') && (
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  DH SPECIALIST SECTION
                </span>
                <span className="text-xs font-bold text-slate-800">District Hospital (DH) Notes</span>
              </div>
              <textarea
                rows={2}
                value={dhNotes}
                onChange={(e) => setDhNotes(e.target.value)}
                placeholder="District Hospital specialist staging, biopsy review, radiology consultation notes..."
                className="w-full text-sm rounded-xl border border-amber-200 bg-amber-50/20 px-3 py-2 outline-none focus:border-amber-500"
              />
            </div>
          )}

          {tier === 'tcc' && (
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                  TERTIARY ONCOLOGY SECTION
                </span>
                <span className="text-xs font-bold text-slate-800">Tertiary Care Centre (TCC) Notes</span>
              </div>
              <textarea
                rows={3}
                value={tccNotes}
                onChange={(e) => setTccNotes(e.target.value)}
                placeholder="Tumor Board review consensus, Chemotherapy/Radiotherapy protocol, Surgical plan..."
                className="w-full text-sm rounded-xl border border-rose-200 bg-rose-50/20 px-3 py-2 outline-none focus:border-rose-500"
              />
            </div>
          )}

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
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-sky-600 text-white shadow-md hover:bg-sky-700 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Icon name="check" size={16} />
              <span>{saving ? 'Saving...' : 'Save Physical Exam & Notes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
