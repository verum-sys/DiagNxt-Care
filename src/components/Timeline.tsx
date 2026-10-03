import type { FacilityEvent, FollowUp, Referral, SyncEvent } from '../db/types';
import { isOverride } from '../intelligence/engine';
import { useLang } from '../i18n';
import { Icon } from './Icon';
import { Chip } from './StatusChip';

type Entry =
  | { kind: 'created'; at: string }
  | { kind: 'followup'; at: string; fu: FollowUp }
  | { kind: 'facility'; at: string; ev: FacilityEvent }
  | { kind: 'sync'; at: string };

/** Longitudinal view of the patient journey: worker actions, facility actions and sync events, newest first. */
export function Timeline({
  referral,
  followUps,
  facilityEvents,
  syncEvents = [],
}: {
  referral: Referral;
  followUps: FollowUp[];
  facilityEvents: FacilityEvent[];
  syncEvents?: SyncEvent[];
}) {
  const { t, formatDateTime, formatDate } = useLang();

  const entries: Entry[] = [
    { kind: 'created' as const, at: referral.createdAt },
    ...followUps.map((fu) => ({ kind: 'followup' as const, at: fu.at, fu })),
    ...facilityEvents.map((ev) => ({ kind: 'facility' as const, at: ev.at, ev })),
    ...syncEvents.filter((s) => s.referralIds.includes(referral.id)).map((s) => ({ kind: 'sync' as const, at: s.at })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <ol className="relative space-y-3 border-l-2 border-line pl-5">
      {entries.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[1.72rem] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${
              e.kind === 'facility' ? 'bg-brand' : e.kind === 'sync' ? 'bg-accent' : e.kind === 'created' ? 'bg-slate-400' : 'bg-warn'
            }`}
            aria-hidden="true"
          />
          <div className="text-[0.8rem] text-muted">{formatDateTime(e.at)}</div>
          {e.kind === 'created' && <div className="font-semibold">{t('timeline.created')}</div>}
          {e.kind === 'sync' && (
            <div className="flex items-center gap-1.5 font-semibold text-accent">
              <Icon name="sync" size={16} />
              {t('timeline.synced')}
            </div>
          )}
          {e.kind === 'facility' && (
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-brand">
                <Icon name="building" size={16} />
                {t(`event.${e.ev.kind}`)}
              </div>
              {e.ev.text && (
                <div className="text-[0.95rem]">{e.ev.kind === 'scheduled' ? formatDate(e.ev.text.slice(0, 10)) + e.ev.text.slice(10) : e.ev.text}</div>
              )}
            </div>
          )}
          {e.kind === 'followup' && (
            <div>
              <div className="flex items-center gap-1.5 font-semibold">
                <Icon name="user" size={16} />
                {t(`fu.${e.fu.action}`)}
                {e.fu.data?.date && <span className="font-normal text-muted">· {formatDate(e.fu.data.date)}</span>}
              </div>
              {e.fu.note && <div className="text-[0.95rem]">{e.fu.note}</div>}
              {e.fu.suggestedAction && e.fu.suggestedAction !== 'none' && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.8rem] text-muted">
                  <span>{t('timeline.suggested', { action: `action.${e.fu.suggestedAction}` })}</span>
                  {isOverride(e.fu) ? (
                    <Chip tone="info">{t('timeline.override')}</Chip>
                  ) : (
                    <Chip tone="ok">{t('timeline.followedSuggestion')}</Chip>
                  )}
                </div>
              )}
            </div>
          )}
        </li>
      ))}
      {entries.length === 0 && <li className="text-muted">{t('timeline.empty')}</li>}
    </ol>
  );
}
