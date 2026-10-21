import { isRecord } from './schema.ts';

/**
 * Reason headlines for SERVER-rejected steps (brief A2b).
 *
 * The A2 tool hid the reason behind a selected `reasons` field. The real
 * explanation lives in different fields per rejection kind: `failure`
 * (a code and a message) on note-keeping rejections, and `reasons`, `paths`
 * and `expected` on card rejections. The headline is built in this order:
 * 1. a `failure` object  -> `code: message` (message may be shortened; the
 *    full text stays in the complete response that is also shown),
 * 2. otherwise `reasons` -> joined, plus the first path and its code,
 * 3. otherwise the literal fallback below — never blank, never null.
 */

const HEADLINE_MESSAGE_LIMIT = 200;
export const NO_EXPLANATION_HEADLINE = 'no explanation fields in the response';

const COLLAPSED_HEADLINE_CODE = NO_EXPLANATION_HEADLINE;

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value) ?? String(value);
}

function shorten(text: string): string {
  return text.length > HEADLINE_MESSAGE_LIMIT
    ? `${text.slice(0, HEADLINE_MESSAGE_LIMIT)}...`
    : text;
}

export function reasonHeadline(value: Record<string, unknown>): string {
  const failure = value['failure'];
  if (isRecord(failure)) {
    const code = asText(failure['code']) || '(no code)';
    const message = asText(failure['message']);
    return message === '' ? code : `${code}: ${shorten(message)}`;
  }
  const reasons = value['reasons'];
  if (Array.isArray(reasons) && reasons.length > 0) {
    const joined = reasons.map(asText).join(', ');
    const paths = value['paths'];
    if (Array.isArray(paths) && paths.length > 0 && isRecord(paths[0])) {
      const first = paths[0];
      return `${joined} (first path ${asText(first['path'])}: ${asText(first['code'])})`;
    }
    return joined;
  }
  return NO_EXPLANATION_HEADLINE;
}

/** The stable bucket name the verdict counts rejections by. */
export function reasonCode(value: Record<string, unknown>): string {
  const failure = value['failure'];
  if (isRecord(failure)) return asText(failure['code']) || '(no code)';
  const reasons = value['reasons'];
  if (Array.isArray(reasons) && reasons.length > 0) return reasons.map(asText).join(', ');
  return COLLAPSED_HEADLINE_CODE;
}

export interface ReasonCount {
  code: string;
  count: number;
}

/**
 * Count rejections by headline code, sorted by count descending then code
 * ascending, so the verdict line is deterministic: e.g.
 * `SERVER: 2 quote_mismatch, 1 UNSUPPORTED_FACT_ENCODING`.
 */
export function countByReasonCode(codes: ReadonlyArray<string | null>): ReasonCount[] {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const bucket = code ?? COLLAPSED_HEADLINE_CODE;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
