import { useEffect, useState } from 'react';
import { onChange } from './db';

/** Run an async IndexedDB query and re-run it whenever the local database changes. */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean } {
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({ data: undefined, loading: true });
  useEffect(() => {
    let alive = true;
    const run = () =>
      void query().then((data) => {
        if (alive) setState({ data, loading: false });
      });
    run();
    const off = onChange(run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
