export interface InterviewRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
/** One answer per listening session. Disposed recognizers cannot advance a new question. */
export function listenForInterviewAnswer(rec: InterviewRecognition, options: {
  lang: string;
  onTranscript: (text: string) => void;
  onAnswer: (text: string) => void;
  onStopped: () => void;
}) {
  let disposed = false;
  let answered = false;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = options.lang;
  rec.onresult = event => {
    if (disposed || answered) return;
    let final = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) final += result[0].transcript + ' ';
      else interim += result[0].transcript + ' ';
    }
    options.onTranscript((final + interim).trim());
    if (final.trim() && !interim.trim()) {
      answered = true;
      options.onAnswer(final.trim());
    }
  };
  rec.onerror = event => {
    if (!disposed && event.error !== 'no-speech') options.onStopped();
  };
  rec.onend = () => { if (!disposed) options.onStopped(); };
  const dispose = () => {
    disposed = true;
    rec.onresult = null; rec.onend = null; rec.onerror = null;
    try { rec.stop(); } catch { /* Already stopped. */ }
  };
  try { rec.start(); } catch { dispose(); options.onStopped(); }
  return dispose;
}

export function parseInterviewNumber(answer: string, maximum = 120): number | undefined {
  const normalized = answer.toLowerCase().replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - '०'.charCodeAt(0)));
  if (/-\s*\d|\d\.\d/.test(normalized)) return undefined;
  const numeric = normalized.match(/\b\d{1,3}\b/);
  if (numeric) { const age = Number(numeric[0]); return age <= maximum ? age : undefined; }
  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
    fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
  const tokens = normalized.replace(/\b(i am|i'm|my age is|age is|age|years?|old)\b/g, '').replace(/[-.,]/g, ' ').trim().split(/\s+/).filter(token => token !== 'and');
  if (!tokens.length) return undefined;
  let age = 0;
  for (const token of tokens) {
    if (token === 'hundred') age = (age || 1) * 100;
    else if (token in words) age += words[token];
    else return undefined;
  }
  return age <= maximum ? age : undefined;
}

export const parseInterviewAge = (answer: string) => parseInterviewNumber(answer, 120);
