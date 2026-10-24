import React, { useState } from 'react';
import type { CareTier, Urgency } from '../db/types';
import { referToNextTier } from '../db/repo';
import { Icon } from './Icon';

interface TierReferralModalProps {
  referralId: string;
  patientName: string;
  currentTier: CareTier;
  isOpen: boolean;
  onClose: () => void;
  onReferred?: () => void;
}

export function TierReferralModal({
  referralId,
  patientName,
  currentTier,
  isOpen,
  onClose,
  onReferred,
}: TierReferralModalProps) {
  if (!isOpen) return null;

  const targetTier: CareTier =
    currentTier === 'asha' ? 'phc' : currentTier === 'phc' ? 'dh' : 'tcc';

  const tierNames: Record<CareTier, string> = {
    asha: 'ASHA Grassroots',
    phc: 'Primary Health Centre (PHC)',
    dh: 'District Hospital (DH)',
    tcc: 'Tertiary Care Centre (TCC Oncology)',
  };

  const defaultFacilities: Record<CareTier, string[]> = {
    asha: ['ASHA Bero Unit A', 'ASHA Rampur Unit B', 'ASHA Mandar Unit C'],
    phc: ['PHC Itki Unit A', 'PHC Bero Unit B', 'PHC Kanke Unit C'],
    dh: ['Sadar District Hospital Ranchi (DH Unit A)', 'DH Khunti (Unit B)', 'DH Gumla (Unit C)'],
    tcc: ['RIMS Regional Cancer Centre (TCC Unit A)', 'State Apex Cancer Institute (TCC Unit B)', 'Apex Oncology Centre (TCC Unit C)'],
  };

  const [destinationFacility, setDestinationFacility] = useState(defaultFacilities[targetTier][0] || '');
  const [urgency, setUrgency] = useState<Urgency>('soon');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await referToNextTier(referralId, targetTier, destinationFacility, notes.trim(), urgency, (['a', 'b', 'c'] as const)[defaultFacilities[targetTier].indexOf(destinationFacility)]);
      onReferred?.();
      onClose();
    } catch { setError('Referral could not be saved. Please try again.'); } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
              CLINICAL REFERRAL PIPELINE
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-1 font-display">
              Refer to Next Level: {tierNames[targetTier]}
            </h2>
            <p className="text-xs text-slate-500">
              Escalating patient <strong className="text-slate-800">{patientName}</strong> from{' '}
              <span className="uppercase font-semibold">{currentTier}</span> to{' '}
              <span className="uppercase font-semibold text-emerald-700">{targetTier}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <Icon name="back" size={20} className="rotate-180" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {/* Target Facility */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Destination {targetTier.toUpperCase()} Facility
            </label>
            <select
              value={destinationFacility}
              onChange={(e) => setDestinationFacility(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 bg-white"
            >
              {defaultFacilities[targetTier].map((fac) => (
                <option key={fac} value={fac}>
                  {fac}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Referral Urgency Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['routine', 'soon', 'urgent'] as Urgency[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                    urgency === u
                      ? u === 'urgent'
                        ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-300'
                        : u === 'soon'
                        ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-300'
                        : 'border-sky-500 bg-sky-50 text-sky-800 ring-2 ring-sky-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Clinical Escalation Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Referral Reason & Handover Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500"
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
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 text-white shadow-md hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Icon name="check" size={16} />
              <span>{submitting ? 'Referring...' : `Confirm Referral to ${targetTier.toUpperCase()}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
