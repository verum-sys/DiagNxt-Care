import { describe, expect, it, vi } from 'vitest';
import { listenForInterviewAnswer, parseInterviewAge, type InterviewRecognition } from './interviewRecognition';
function recognizer(): InterviewRecognition {
  return { continuous: false, interimResults: false, lang: '', start: vi.fn(), stop: vi.fn(), onresult: null, onend: null, onerror: null };
}
function result(text: string, final = true) {
  return { resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: final })] };
}
describe('one-question voice interview', () => {
  it('dispatches the next answer to the current handler instead of repeating age', () => {
    const applied: string[] = [];
    const latest = { current: (text: string) => applied.push(`name:${text}`) };
    const listen = () => {
      const rec = recognizer();
      listenForInterviewAnswer(rec, { lang: 'en-IN', onTranscript: vi.fn(), onStopped: vi.fn(), onAnswer: text => latest.current(text) });
      return rec;
    };
    listen().onresult?.(result('Sunita Devi'));
    latest.current = text => applied.push(`age:${text}`);
    listen().onresult?.(result('26'));
    latest.current = text => applied.push(`sex:${text}`);
    listen().onresult?.(result('Female'));
    expect(applied).toEqual(['name:Sunita Devi', 'age:26', 'sex:Female']);
  });
  it('accepts a final answer once despite duplicate browser results', () => {
    const rec = recognizer(); const answer = vi.fn();
    listenForInterviewAnswer(rec, { lang: 'en-IN', onTranscript: vi.fn(), onAnswer: answer, onStopped: vi.fn() });
    rec.onresult?.(result('26', false));
    expect(answer).not.toHaveBeenCalled();
    rec.onresult?.(result('26')); rec.onresult?.(result('26'));
    expect(answer).toHaveBeenCalledExactlyOnceWith('26');
  });
  it('ignores queued results after stopping or moving to another question', () => {
    const rec = recognizer(); const answer = vi.fn(); const stopped = vi.fn();
    const dispose = listenForInterviewAnswer(rec, { lang: 'hi-IN', onTranscript: vi.fn(), onAnswer: answer, onStopped: stopped });
    const lateResult = rec.onresult; const lateEnd = rec.onend;
    dispose(); lateResult?.(result('26')); lateEnd?.();
    expect(answer).not.toHaveBeenCalled(); expect(stopped).not.toHaveBeenCalled();
    expect(rec.stop).toHaveBeenCalledOnce();
  });
  it.each([['26', 26], ['26 years old', 26], ['I am twenty six years old', 26], ['twenty-six', 26], ['२६ साल', 26], ['one hundred and five', 105], ['0', 0], ['130', undefined], ['not sure', undefined]])('parses age %s', (text, expected) => {
    expect(parseInterviewAge(text)).toBe(expected);
  });
});
