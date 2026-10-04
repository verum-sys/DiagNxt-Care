import { useState } from 'react';
import type { FollowUp, Patient, Referral } from '../db/types';
import { useLang } from '../i18n';
import { deriveFacts } from '../intelligence/facts';
import { buildDraftFieldRows } from '../intelligence/stage/draftFields';
import {
  CHECKLIST_LABEL,
  deriveCaseStageSaved,
  getStageExpectations,
  isChecklistItemComplete,
} from '../intelligence/stage/deriveStage';
import { today } from '../intelligence/dates';
import { parseFreeText } from '../intelligence/parser';
import { Icon } from './Icon';
import { CaseStageChip, FieldStatusChip } from './StatusChip';

export function CaseStageSummary({
  patient,
  referral,
  followUps,
  dismissible,
  onDismiss,
}: {
  patient: Patient;
  referral: Referral;
  followUps: FollowUp[];
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const { t, formatDate } = useLang();
  const [open, setOpen] = useState(true);
  const day = today();
  const facts = deriveFacts(referral, followUps, day);
  const stage = deriveCaseStageSaved(patient, referral, facts, day);

  const parsed = parseFreeText(referral.notes || `${patient.name} referred to ${referral.destinationFacility}`, new Date());
  const { rows } = buildDraftFieldRows(referral.notes, parsed, {
    name: patient.name,
    age: patient.age?.toString() ?? '',
    phone: patient.phone ?? '',
    locality: patient.locality ?? '',
    reason: referral.reason,
    destinationFacility: referral.destinationFacility,
    referralDate: referral.referralDate,
    urgency: referral.urgency,
    appointmentDate: referral.worker.appointmentDate ?? referral.facility.appointmentDate ?? '',
    patientIntention: referral.patientIntention ?? '',
    facilityResponse: referral.worker.facilityResponse ?? referral.facility.response,
    screeningCompleted: referral.screening?.completed ?? false,
    screeningArea: referral.screening?.area ?? '',
    screeningFinding: referral.screening?.finding ?? '',
    referralRequired: referral.screening?.referralRequired ?? '',
  });

  const rowByKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const expectations = getStageExpectations(stage);

  if (dismissible && !open) return null;

  function display(row: (typeof rows)[0]) {
    if (row.displayValueKey) return t(row.displayValueKey);
    if (row.key === 'referralDate' || row.key === 'appointmentDate') {
      return row.displayValue ? formatDate(row.displayValue) : undefined;
    }
    return row.displayValue;
  }

  function checklistSection(titleKey: string, keys: typeof expectations.complete) {
    if (keys.length === 0) return null;
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
    <section className="card space-y-3 border-brand/30 bg-info-soft/40" data-testid="case-stage-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-brand">{t('stageSummary.title')}</h2>
        {dismissible && (
          <button type="button" className="btn btn-ghost !min-h-[40px] text-[0.9rem]" onClick={() => { setOpen(false); onDismiss?.(); }}>
            {t('stageSummary.dismiss')}
          </button>
        )}
      </div>
      <CaseStageChip stage={stage} />
      {stage === 'referral_initiated' && (
        <p className="text-[0.9rem] text-brand">
          <span className="font-semibold">{t('draft.nextExpected')}: </span>
          {t('draft.nextFacilityConfirmation')}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {rows
          .filter((r) => r.key !== 'caseStage')
          .map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-2 border-b border-line/70 py-1.5 text-[0.85rem] sm:text-[0.9rem]">
              <span className="text-muted min-w-0">{t(row.labelKey)}</span>
              <span className="text-right shrink-0">
                {(row.status === 'known' || row.status === 'tentative') && display(row) ? (
                  <span className="font-semibold">{display(row)}</span>
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
        {checklistSection('draft.checklist.complete', expectations.complete)}
        {checklistSection('draft.checklist.pending', expectations.pending)}
        {checklistSection('draft.checklist.notApplicable', expectations.notApplicable)}
      </div>
    </section>
  );
}
