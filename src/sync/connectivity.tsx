import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { onChange } from '../db/db';
import { outboxCount } from '../db/repo';
import { syncNow, type SyncResult } from './sync';

const SIM_KEY = 'carelink.simulateOffline';
const READY_KEY = 'carelink.offlineReady';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

interface ConnectivityCtx {
  /** Effective connectivity used by the whole app (real connection AND not simulating offline). */
  online: boolean;
  simulateOffline: boolean;
  setSimulateOffline: (v: boolean) => void;
  offlineReady: boolean;
  pending: number;
  syncing: boolean;
  lastResult: SyncResult | null;
  sync: () => Promise<void>;
  needRefresh: boolean;
  reloadApp: () => Promise<void>;
}

const Ctx = createContext<ConnectivityCtx | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [realOnline, setRealOnline] = useState(() => navigator.onLine);
  const [simulateOffline, setSim] = useState(() => readFlag(SIM_KEY));
  const [offlineReady, setOfflineReady] = useState(
    () => readFlag(READY_KEY) || (typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller),
  );
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  // Service worker: app shell is cached for offline use after the first load.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onOfflineReady() {
      writeFlag(READY_KEY, true);
      setOfflineReady(true);
    },
    onRegisteredSW(_url, reg) {
      if (reg?.active) {
        writeFlag(READY_KEY, true);
        setOfflineReady(true);
      }
    },
    onNeedRefresh() {
      void updateServiceWorker(true);
    },
  });

  const reloadApp = useCallback(async () => {
    try {
      await updateServiceWorker(true);
    } catch {
      /* ignore */
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        await r.update();
      }
    }
    window.location.reload();
  }, [updateServiceWorker]);

  useEffect(() => {
    const up = () => setRealOnline(true);
    const down = () => setRealOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    const refresh = () => void outboxCount().then(setPending);
    refresh();
    return onChange(refresh);
  }, []);

  const setSimulateOffline = useCallback((v: boolean) => {
    writeFlag(SIM_KEY, v);
    setSim(v);
  }, []);

  const online = realOnline && !simulateOffline;

  const sync = useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      setLastResult(await syncNow());
    } finally {
      setSyncing(false);
    }
  }, [online, syncing]);

  return (
    <Ctx.Provider
      value={{
        online,
        simulateOffline,
        setSimulateOffline,
        offlineReady,
        pending,
        syncing,
        lastResult,
        sync,
        needRefresh,
        reloadApp,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useConnectivity(): ConnectivityCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConnectivity outside ConnectivityProvider');
  return c;
}
