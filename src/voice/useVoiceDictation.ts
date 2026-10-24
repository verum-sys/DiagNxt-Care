import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { EXAMPLES } from '../intelligence/parser';
import { dictationClipUrl } from './prompts';

export type DictationSampleKey = 'en' | 'hinglish' | 'hindi';

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let sharedAudio: HTMLAudioElement | null = null;
const blobUrls = new Map<string, string>();

function unlockAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  sharedAudio.src = SILENT_WAV;
  void sharedAudio.play().catch(() => undefined);
  return sharedAudio;
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

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

export function getSpeechRecognition(): (new () => SpeechRec) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseVoiceDictationOptions {
  lang: Lang;
  online: boolean;
  selectedSample?: DictationSampleKey;
  onTranscript: (text: string, isFinal: boolean) => void;
  onComplete?: (text: string) => void;
}

export function useVoiceDictation({
  lang,
  online,
  selectedSample,
  onTranscript,
  onComplete,
}: UseVoiceDictationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [activeMode, setActiveMode] = useState<'mic' | 'sample' | null>(null);

  const recRef = useRef<SpeechRec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCancelledRef = useRef(false);

  const stop = useCallback(() => {
    isCancelledRef.current = true;
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onerror = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsListening(false);
    setActiveMode(null);
  }, []);

  useEffect(() => stop, [stop]);

  const defaultSampleKey: DictationSampleKey = selectedSample ?? (lang === 'hi' ? 'hindi' : 'en');

  const startSampleDictation = useCallback(
    async (sampleKey = defaultSampleKey) => {
      stop();
      isCancelledRef.current = false;
      setIsListening(true);
      setActiveMode('sample');

      const fullText = EXAMPLES[sampleKey];
      const words = fullText.split(/\s+/);
      const audio = unlockAudio();
      audioRef.current = audio;

      const finish = () => {
        if (isCancelledRef.current) return;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        onTranscript(fullText, true);
        setIsListening(false);
        setActiveMode(null);
        onComplete?.(fullText);
      };

      try {
        const url = await clipBlobUrl(dictationClipUrl(sampleKey));
        if (isCancelledRef.current) return;

        audio.src = url;
        audio.ontimeupdate = () => {
          if (isCancelledRef.current || !audio.duration) return;
          const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
          const count = Math.min(words.length, Math.floor(progress * words.length) + 1);
          const partial = words.slice(0, count).join(' ');
          onTranscript(partial, false);
        };
        audio.onended = finish;
        audio.onerror = () => {
          // Fallback if audio fails to play
          fallbackTimer();
        };

        await audio.play();
      } catch {
        // Fallback to streaming text if audio loading fails
        fallbackTimer();
      }

      function fallbackTimer() {
        if (isCancelledRef.current) return;
        let index = 0;
        timerRef.current = setInterval(() => {
          if (isCancelledRef.current) return;
          index += 2;
          if (index >= words.length) {
            finish();
          } else {
            onTranscript(words.slice(0, index).join(' '), false);
          }
        }, 300);
      }
    },
    [defaultSampleKey, onTranscript, onComplete, stop],
  );

  const startMicDictation = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR || !online) {
      void startSampleDictation();
      return;
    }

    stop();
    isCancelledRef.current = false;
    setIsListening(true);
    setActiveMode('mic');

    const rec = new SR();
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    rec.interimResults = true;

    rec.onresult = (e) => {
      if (isCancelledRef.current) return;
      const said = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      const isFinal = Array.from(e.results).every((r) => (r as any).isFinal);
      onTranscript(said, isFinal);
      if (isFinal) {
        onComplete?.(said);
      }
    };

    rec.onerror = () => {
      // If mic fails (e.g. offline network error), fallback to sample dictation
      if (!isCancelledRef.current) {
        void startSampleDictation();
      }
    };

    rec.onend = () => {
      if (!isCancelledRef.current && activeMode === 'mic') {
        setIsListening(false);
        setActiveMode(null);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      void startSampleDictation();
    }
  }, [online, lang, onTranscript, onComplete, startSampleDictation, stop, activeMode]);

  const toggle = useCallback(
    (sampleKey?: DictationSampleKey) => {
      if (isListening) {
        stop();
      } else if (online && getSpeechRecognition() && !sampleKey) {
        startMicDictation();
      } else {
        void startSampleDictation(sampleKey ?? defaultSampleKey);
      }
    },
    [isListening, online, defaultSampleKey, startMicDictation, startSampleDictation, stop],
  );

  return {
    isListening,
    activeMode,
    toggle,
    stop,
    startSampleDictation,
    startMicDictation,
    defaultSampleKey,
  };
}
