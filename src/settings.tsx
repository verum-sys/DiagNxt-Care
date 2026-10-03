import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_WORKER } from './db/seed';

const WORKER_KEY = 'carelink.worker';

interface SettingsCtx {
  workerName: string;
  setWorkerName: (n: string) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [workerName, setName] = useState(() => {
    try {
      return localStorage.getItem(WORKER_KEY) || DEFAULT_WORKER;
    } catch {
      return DEFAULT_WORKER;
    }
  });
  const setWorkerName = useCallback((n: string) => {
    setName(n);
    try {
      localStorage.setItem(WORKER_KEY, n);
    } catch {
      /* ignore */
    }
  }, []);
  return <Ctx.Provider value={{ workerName, setWorkerName }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings outside SettingsProvider');
  return c;
}
