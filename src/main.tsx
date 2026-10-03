import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { seedIfEmpty } from './db/seed';
import { LangProvider } from './i18n';
import { SettingsProvider } from './settings';
import { ConnectivityProvider } from './sync/connectivity';
import './index.css';

async function boot() {
  // Ask the browser not to evict on-device case data under storage pressure.
  void navigator.storage?.persist?.();
  await seedIfEmpty();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider>
        <SettingsProvider>
          <ConnectivityProvider>
            <App />
          </ConnectivityProvider>
        </SettingsProvider>
      </LangProvider>
    </StrictMode>,
  );
}

void boot();
