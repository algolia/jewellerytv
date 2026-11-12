import { describe, expect, it } from 'vitest';
import { readPanelState, writePanelState, type PanelState } from '../../src/concierge/panelState';

/* A stand-in for sessionStorage. Only the two methods the module touches are
 * real; the rest of the Storage interface is never reached. */
function fakeStorage(seed?: Record<string, string>) {
  const map = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  } as unknown as Storage;
}

/* Safari in private mode and partitioned storage in the embed frame throw on
 * the property access itself, so the guard has to survive a throw rather than
 * a null. */
const throwingStorage = {
  getItem() {
    throw new DOMException('denied');
  },
  setItem() {
    throw new DOMException('denied');
  },
} as unknown as Storage;

const KEY = 'jtv.concierge.panel';
const CLOSED: PanelState = { open: false, size: 'normal' };

describe('the remembered panel state', () => {
  it('round-trips every combination', () => {
    const states: PanelState[] = [
      { open: false, size: 'normal' },
      { open: false, size: 'minimized' },
      { open: true, size: 'normal' },
      { open: true, size: 'minimized' },
    ];
    for (const state of states) {
      const storage = fakeStorage();
      writePanelState(storage, state);
      expect(readPanelState(storage), JSON.stringify(state)).toEqual(state);
    }
  });

  it('starts closed and expanded when nothing has been stored', () => {
    expect(readPanelState(fakeStorage())).toEqual(CLOSED);
  });

  /* The key outlives the code that wrote it, and sessionStorage is shared
   * with whatever else holds this origin. Anything unreadable is the default
   * rather than a crash or a half-applied state. */
  it('falls back to closed for anything it cannot read', () => {
    for (const stored of ['', 'not json', 'null', '[]', '"minimized"', '42']) {
      expect(readPanelState(fakeStorage({ [KEY]: stored })), stored).toEqual(CLOSED);
    }
  });

  it('keeps the readable half of a partly wrong object', () => {
    expect(readPanelState(fakeStorage({ [KEY]: '{"open":true}' }))).toEqual({
      open: true,
      size: 'normal',
    });
    expect(readPanelState(fakeStorage({ [KEY]: '{"size":"minimized"}' }))).toEqual({
      open: false,
      size: 'minimized',
    });
    /* A size this build no longer has — the full-height rail, dropped
     * 2026-11-12 — must not survive as a class nothing styles. */
    expect(readPanelState(fakeStorage({ [KEY]: '{"open":true,"size":"maximized"}' }))).toEqual({
      open: true,
      size: 'normal',
    });
  });

  it('treats a truthy-but-not-true open as closed', () => {
    expect(readPanelState(fakeStorage({ [KEY]: '{"open":"yes"}' })).open).toBe(false);
  });

  it('falls back to closed when storage throws', () => {
    expect(readPanelState(throwingStorage)).toEqual(CLOSED);
  });

  /* The embed passes no storage at all rather than branching at every call
   * site. */
  it('tolerates having no storage', () => {
    expect(readPanelState(undefined)).toEqual(CLOSED);
    expect(() => writePanelState(undefined, { open: true, size: 'minimized' })).not.toThrow();
  });

  it('does not throw when a write is refused', () => {
    expect(() => writePanelState(throwingStorage, CLOSED)).not.toThrow();
  });
});
