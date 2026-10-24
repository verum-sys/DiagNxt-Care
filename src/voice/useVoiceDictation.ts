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
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
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
  disableSampleFallback?: boolean;
  onTranscript: (text: string, isFinal: boolean) => void;
  onComplete?: (text: string) => void;
}

export function useVoiceDictation({
  lang,
  online,
  selectedSample,
  disableSampleFallback = false,
  onTranscript,
  onComplete,
}: UseVoiceDictationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [activeMode, setActiveMode] = useState<'mic' | 'sample' | null>(null);

  const recRef = useRef<SpeechRec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCancelledRef = useRef(false);
  const transcriptRef = useRef('');

  const stop = useCallback(() => {
    isCancelledRef.current = true;
    transcriptRef.current = '';
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
      if (!disableSampleFallback) {
        void startSampleDictation();
      }
      return;
    }

    stop();
    isCancelledRef.current = false;
    transcriptRef.current = '';
    setIsListening(true);
    setActiveMode('mic');

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === 'hi' ? 'hi-IN' : 'en-US';

    rec.onresult = (e: any) => {
      if (isCancelledRef.current) return;
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscript += piece + ' ';
        } else {
          interimTranscript += piece;
        }
      }

      if (finalTranscript) {
        transcriptRef.current = (
          transcriptRef.current ? transcriptRef.current + ' ' + finalTranscript : finalTranscript
        ).trim();
      }

      const currentFull = transcriptRef.current;
      const combined = interimTranscript
        ? (currentFull ? currentFull + ' ' + interimTranscript : interimTranscript).trim()
        : currentFull;

      if (combined) {
        onTranscript(combined, !interimTranscript);
        if (!interimTranscript && finalTranscript) {
          onComplete?.(currentFull);
        }
      }
    };

    rec.onerror = (e) => {
      console.warn('Speech recognition error:', e.error);
      if (e.error === 'no-speech') {
        // Continuous mode in WebKit/Blink can emit no-speech on short silence; don't cancel
        return;
      }
      if (!isCancelledRef.current) {
        if (!disableSampleFallback) {
          void startSampleDictation();
        } else {
          setIsListening(false);
          setActiveMode(null);
        }
      }
    };

    rec.onend = () => {
      if (!isCancelledRef.current && activeMode === 'mic') {
        setIsListening(false);
        setActiveMode(null);
        if (transcriptRef.current.trim()) {
          onComplete?.(transcriptRef.current.trim());
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      if (!disableSampleFallback) {
        void startSampleDictation();
      } else {
        setIsListening(false);
        setActiveMode(null);
      }
    }
  }, [online, lang, onTranscript, onComplete, startSampleDictation, stop, activeMode, disableSampleFallback]);

  const toggle = useCallback(
    (sampleKey?: DictationSampleKey) => {
      if (isListening) {
        stop();
      } else if (sampleKey) {
        void startSampleDictation(sampleKey);
      } else if (online && getSpeechRecognition()) {
        startMicDictation();
      } else if (!disableSampleFallback) {
        void startSampleDictation(defaultSampleKey);
      }
    },
    [isListening, online, defaultSampleKey, startMicDictation, startSampleDictation, stop, disableSampleFallback],
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
