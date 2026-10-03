import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n';
import { BUNDLED_PROMPT_KEYS, clipUrl } from './prompts';

/** A spoken segment: a message key (bundled clip if available) or free text (device TTS). */
export type Segment = { key: string } | { text: string };

// Mobile browsers only allow audio started from a tap, and reject media served as a plain 200
// from the service-worker cache (no Range support). So: one shared <audio> element that is
// "unlocked" synchronously inside the tap, and clips loaded as blobs via fetch.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let shared: HTMLAudioElement | null = null;
const blobUrls = new Map<string, string>();

function unlockAudio(): HTMLAudioElement {
  if (!shared) shared = new Audio();
  shared.src = SILENT_WAV;
  void shared.play().catch(() => undefined);
  return shared;
}

async function clipBlobUrl(src: string): Promise<string> {
  const cached = blobUrls.get(src);
  if (cached) return cached;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`clip ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  blobUrls.set(src, url);
  return url;
}

async function playClip(src: string, audio: HTMLAudioElement): Promise<void> {
  const url = await clipBlobUrl(src);
  await new Promise<void>((resolve, reject) => {
    // Ignore stray events from the silent unlock clip; only react to this clip.
    audio.onended = () => audio.src === url && resolve();
    audio.onerror = () => audio.src === url && reject(new Error('clip failed'));
    audio.src = url;
    audio.play().catch(reject);
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
  const cancelled = useRef(false);

  const stop = useCallback(() => {
    cancelled.current = true;
    if (shared) {
      shared.onended = null;
      shared.onerror = null;
      shared.pause();
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    async (segments: Segment[]) => {
      stop();
      cancelled.current = false;
      setSpeaking(true);
      const audio = unlockAudio(); // must run synchronously inside the tap
      for (const seg of segments) {
        if (cancelled.current) break;
        if ('key' in seg && BUNDLED_PROMPT_KEYS.includes(seg.key)) {
          try {
            await playClip(clipUrl(lang, seg.key), audio);
            continue;
          } catch {
            /* fall through to device TTS */
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
