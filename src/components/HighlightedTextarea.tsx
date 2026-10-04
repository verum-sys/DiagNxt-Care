import { useCallback, useMemo, useRef } from 'react';
import type { FieldSpan, ParsedField } from '../intelligence/parser';

export interface HighlightedTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  spans?: FieldSpan[];
  rows?: number;
  'data-testid'?: string;
  highlightField?: ParsedField | null;
  readOnly?: boolean;
}

type Segment = { text: string; field?: ParsedField };

function buildSegments(text: string, spans: FieldSpan[]): Segment[] {
  if (!text) return [{ text: '' }];
  if (!spans.length) return [{ text }];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start > cursor) out.push({ text: text.slice(cursor, s.start) });
    if (s.end > s.start) out.push({ text: text.slice(s.start, s.end), field: s.field });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

export function HighlightedTextarea({
  id,
  value,
  onChange,
  spans = [],
  rows = 4,
  'data-testid': testId,
  highlightField = null,
  readOnly = false,
}: HighlightedTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const showHighlights = spans.length > 0;
  const segments = useMemo(() => buildSegments(value, spans), [value, spans]);

  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    if (ta && mirror) {
      mirror.scrollTop = ta.scrollTop;
      mirror.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const highlightBody = (
    <>
      {segments.map((seg, i) =>
        seg.field ? (
          <mark
            key={i}
            data-field={seg.field}
            className={`highlight-field highlight-${seg.field}${highlightField === seg.field ? ' highlight-field-active' : ''}`}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
      {value.endsWith('\n') ? '\n' : null}
    </>
  );

  if (readOnly) {
    return (
      <div className="highlight-ta-wrap">
        <div className="highlight-ta-mirror relative whitespace-pre-wrap break-words">{highlightBody}</div>
      </div>
    );
  }

  return (
    <div className={`highlight-ta-wrap relative${showHighlights ? ' highlight-ta-active' : ''}`}>
      {showHighlights && (
        <div
          ref={mirrorRef}
          className="highlight-ta-mirror pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words"
          aria-hidden
        >
          {highlightBody}
        </div>
      )}
      <textarea
        ref={taRef}
        id={id}
        className="highlight-ta-input relative z-[1]"
        value={value}
        rows={rows}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
      />
    </div>
  );
}

/** Scroll the describe box so a field’s highlight is visible. */
export function scrollToHighlightField(container: HTMLElement | null, field: ParsedField) {
  if (!container) return;
  const mark = container.querySelector(`mark[data-field="${field}"]`);
  mark?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
