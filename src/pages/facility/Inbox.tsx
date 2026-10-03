import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Chip } from '../../components/StatusChip';
import type { Referral } from '../../db/types';
import { useLive } from '../../db/useLive';
import { useLang } from '../../i18n';
import { listRemoteCases } from '../../sync/remote';

export type InboxTab = 'incoming' | 'pending' | 'accepted' | 'scheduled' | 'closed';
const TABS: InboxTab[] = ['incoming', 'pending', 'accepted', 'scheduled', 'closed'];

export function inboxTab(r: Referral): InboxTab {
  const f = r.facility;
  if (f.completed || f.response === 'declined') return 'closed';
  if (f.appointmentDate) return 'scheduled';
  if (f.response === 'accepted') return 'accepted';
  if (f.response === 'received' || f.response === 'info_requested') return 'pending';
  return 'incoming';
}

export function Inbox() {
  const { t, formatDate } = useLang();
  const { data } = useLive(listRemoteCases, []);
  const [tab, setTab] = useState<InboxTab>('incoming');
  const counts = Object.fromEntries(TABS.map((k) => [k, data?.filter((c) => inboxTab(c.referral) === k).length ?? 0])) as Record<InboxTab, number>;
  const shown = data?.filter((c) => inboxTab(c.referral) === tab) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[1.4rem] font-bold">{t('facility.title')}</h1>
        <p className="text-muted">{t('facility.name')}</p>
      </div>
      <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[0.9rem] text-brand">
        <Icon name="info" size={18} className="mt-0.5" />
        {t('facility.banner')}
      </p>

      <div className="-mx-4 overflow-x-auto px-4" role="tablist">
        <div className="flex gap-2">
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`btn whitespace-nowrap !px-3 text-[0.9rem] ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
              data-testid={`tab-${k}`}
            >
              {t(`facility.tab.${k}`)}
              <span className={`rounded-full px-2 text-[0.8rem] ${tab === k ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {shown.map(({ patient, referral }) => (
          <Link key={referral.id} to={`/facility/referral/${referral.id}`} className="card block hover:border-brand/40" data-testid="inbox-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{patient.name}</div>
                <div className="text-[0.85rem] text-muted">
                  {patient.id} · {referral.id}
                </div>
              </div>
              <Icon name="chevron" className="mt-1 text-muted" />
            </div>
            <p className="mt-1">{referral.reason || '—'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[0.85rem]">
              <Chip tone="neutral">{formatDate(referral.referralDate)}</Chip>
              <Chip tone="neutral">{referral.referringWorker}</Chip>
              {referral.urgency !== 'routine' && <Chip tone={referral.urgency === 'urgent' ? 'danger' : 'warn'}>{t(`urgency.${referral.urgency}`)}</Chip>}
              {referral.facility.appointmentDate && <Chip tone="info">{formatDate(referral.facility.appointmentDate)}</Chip>}
              {referral.facility.attendance !== 'unknown' && (
                <Chip tone={referral.facility.attendance === 'attended' ? 'ok' : 'danger'}>{t(`attendance.${referral.facility.attendance}`)}</Chip>
              )}
            </div>
          </Link>
        ))}
        {shown.length === 0 && <p className="card text-muted">{t('facility.empty')}</p>}
      </div>
    </div>
  );
}
