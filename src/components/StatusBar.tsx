import { useLang } from '../i18n';
import { useConnectivity } from '../sync/connectivity';
import { Icon } from './Icon';

/** Persistent connectivity / offline-readiness / sync indicator shown on every screen. */
export function StatusBar({ showSync = true }: { showSync?: boolean }) {
  const { t } = useLang();
  const { online, simulateOffline, offlineReady, pending, syncing, sync, needRefresh, reloadApp } = useConnectivity();

  return (
    <div
      className={`sticky top-0 z-20 border-b ${online ? 'bg-white border-line' : 'bg-slate-800 border-slate-700 text-white'}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2 text-[0.8rem] sm:text-[0.85rem]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`chip ${online ? 'bg-ok-soft text-ok' : 'bg-white/15 text-white'}`}
            data-testid="connectivity"
          >
            <Icon name={online ? 'online' : 'offline'} size={15} />
            {online ? t('status.online') : simulateOffline ? t('status.offlineSim') : t('status.offline')}
          </span>

          <span className={`chip ${offlineReady ? (online ? 'bg-info-soft text-brand' : 'bg-white/15 text-white') : 'bg-slate-100 text-slate-500'}`}>
            <Icon name={offlineReady ? 'check' : 'download'} size={13} />
            {offlineReady ? t('status.readyOffline') : t('status.preparingOffline')}
          </span>

          {needRefresh && (
            <button
              type="button"
              onClick={() => void reloadApp()}
              className="chip cursor-pointer bg-brand text-white font-semibold shadow-sm hover:opacity-90"
              title="A new version of CareLink is ready. Tap to reload."
            >
              <Icon name="spark" size={13} className="text-accent" />
              {t('status.updateReady')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className={`text-[0.78rem] sm:text-[0.85rem] ${online ? 'text-muted' : 'text-slate-200'}`}>
            {pending > 0 ? t('status.pending', { n: pending }) : t('status.allSynced')}
          </span>
          {showSync && online && (
            <button
              type="button"
              onClick={() => void sync()}
              disabled={syncing}
              className={`btn !min-h-[34px] sm:!min-h-[40px] !px-2.5 sm:!px-3 !py-0.5 sm:!py-1 text-[0.78rem] sm:text-[0.85rem] ${pending > 0 ? 'btn-accent' : 'btn-secondary'}`}
            >
              <Icon name="sync" size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? t('status.syncing') : t('status.syncAvailable')}
            </button>
          )}
        </div>
      </div>
      {!online && (
        <div className="mx-auto max-w-2xl px-3 pb-1.5 sm:px-4 sm:pb-2 text-[0.78rem] sm:text-[0.85rem] text-slate-200">{t('status.offlineNote')}</div>
      )}
    </div>
  );
}
