import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type MessageKey } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';
const DICTS: Record<Lang, Partial<Record<MessageKey, string>>> = { en, hi };
const STORAGE_KEY = 'carelink.lang';

type Params = Record<string, string | number | undefined>;
export type T = (key: string, params?: Params) => string;

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function translate(lang: Lang, key: string, params?: Params): string {
  const dict = DICTS[lang];
  const raw = (dict[key as MessageKey] ?? en[key as MessageKey] ?? key) as string;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return '';
    // Params may themselves be message keys (e.g. "attendance.attended").
    if (typeof v === 'string' && v in en) return translate(lang, v);
    return String(v);
  });
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  formatDate: (iso?: string) => string;
  formatDateTime: (iso: string) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode: language just won't persist */
    }
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<LangCtx>(() => {
    const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
    return {
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      formatDate: (iso) => {
        if (!iso) return '—';
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
      },
      formatDateTime: (iso) =>
        new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useLang outside LangProvider');
  return c;
}
