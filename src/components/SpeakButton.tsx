import { useLang } from '../i18n';
import { useSpeak, type Segment } from '../voice/useSpeak';
import { Icon } from './Icon';

export function SpeakButton({ segments, className = '' }: { segments: Segment[]; className?: string }) {
  const { t } = useLang();
  const { speak, stop, speaking } = useSpeak();
  return (
    <button
      type="button"
      className={`btn btn-secondary ${className}`}
      onClick={() => (speaking ? stop() : void speak(segments))}
      aria-pressed={speaking}
    >
      <Icon name="speaker" size={18} className={speaking ? 'animate-pulse' : ''} />
      {t('intel.listen')}
    </button>
  );
}
