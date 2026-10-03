import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { Icon } from './Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Shows an Install button when the browser offers PWA installation (Chrome/Edge/Android). */
export function InstallButton() {
  const { t } = useLang();
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!evt) return null;
  return (
    <button
      type="button"
      className="btn !min-h-[40px] !px-3 !py-1 bg-white/10 text-white text-[0.85rem]"
      onClick={async () => {
        await evt.prompt();
        await evt.userChoice;
        setEvt(null);
      }}
    >
      <Icon name="download" size={16} />
      {t('install.button')}
    </button>
  );
}
