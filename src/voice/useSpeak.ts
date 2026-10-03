import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import { BUNDLED_PROMPT_KEYS, clipUrl } from './prompts';

/** A spoken segment: a message key (bundled clip if available) or free text (device TTS). */
export type Segment = { key: string } | { text: string };

function playClip(src: string, audioRef: { current: HTMLAudioElement | null }): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = new Audio(src);
    audioRef.current = a;
    a.onended = () => resolve();
    a.onerror = () => reject(new Error('clip failed'));
    a.play().catch(reject);
  });
}

function speakTTS(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang === 'hi' ? 'hi' : 'en'));
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function useSpeak() {
  const { lang, t } = useLang();
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelled = useRef(false);

  const stop = useCallback(() => {
    cancelled.current = true;
    audioRef.current?.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (segments: Segment[]) => {
      stop();
      cancelled.current = false;
      setSpeaking(true);
      for (const seg of segments) {
        if (cancelled.current) break;
        if ('key' in seg && BUNDLED_PROMPT_KEYS.includes(seg.key)) {
          try {
            await playClip(clipUrl(lang, seg.key), audioRef);
            continue;
          } catch {
            /* fall through to TTS */
          }
        }
        const text = 'key' in seg ? t(seg.key) : seg.text;
        await speakTTS(text, lang);
      }
      setSpeaking(false);
    },
    [lang, t, stop],
  );

  return { speak, stop, speaking };
}
