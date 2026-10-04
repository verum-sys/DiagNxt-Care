import type { ReactNode } from 'react';
import type { CareStateKey, CaseStageKey, FieldDisplayStatus, SyncStatus } from '../db/types';
import { useLang } from '../i18n';
import { Icon } from './Icon';

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'brand';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-brand',
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand text-white',
};

export function Chip({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: string }) {
  return (
    <span className={`chip ${TONE_CLASS[tone]}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export const CARE_STATE_TONE: Record<CareStateKey, Tone> = {
  incomplete: 'danger',
  not_sent: 'warn',
  awaiting_facility: 'warn',
  info_requested: 'warn',
  declined: 'danger',
  accepted_no_appt: 'warn',
  scheduled: 'info',
  appt_passed_unknown: 'danger',
  not_attended: 'danger',
  attended_outcome_unknown: 'warn',
  follow_up_required: 'warn',
  closed: 'ok',
};

export function CareStateChip({ state }: { state: CareStateKey }) {
  const { t } = useLang();
  return <Chip tone={CARE_STATE_TONE[state]}>{t(`careState.${state}`)}</Chip>;
}

export function SyncChip({ status }: { status: SyncStatus }) {
  const { t } = useLang();
  return status === 'pending' ? (
    <Chip tone="warn" icon="sync">
      {t('chip.pendingSync')}
    </Chip>
  ) : (
    <Chip tone="ok" icon="check">
      {t('chip.synced')}
    </Chip>
  );
}

const FIELD_STATUS_TONE: Record<FieldDisplayStatus, Tone> = {
  known: 'ok',
  tentative: 'warn',
  pending: 'info',
  unknown: 'warn',
  not_applicable: 'neutral',
  completed: 'ok',
  missed: 'danger',
  not_assessed: 'neutral',
};

export function FieldStatusChip({ status }: { status: FieldDisplayStatus }) {
  const { t } = useLang();
  return <Chip tone={FIELD_STATUS_TONE[status]}>{t(`fieldStatus.${status}`)}</Chip>;
}

export function CaseStageChip({ stage }: { stage: CaseStageKey }) {
  const { t } = useLang();
  return <Chip tone="brand">{t(`caseStage.${stage}`)}</Chip>;
}

export function DueChip({ days, waiting }: { days?: number; waiting?: boolean }) {
  const { t } = useLang();
  if (days === undefined) return null;
  if (waiting) return days < 0 ? <Chip tone="neutral">{t('chip.waiting', { n: -days })}</Chip> : null;
  if (days < 0) return <Chip tone="danger">{t('chip.overdue', { n: -days })}</Chip>;
  if (days === 0) return <Chip tone="warn">{t('chip.dueToday')}</Chip>;
  return <Chip tone="info">{t('chip.dueIn', { n: days })}</Chip>;
}
