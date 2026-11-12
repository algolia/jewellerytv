import { describe, expect, it } from 'vitest';
import { readPanelSize, writePanelSize, type PanelSize } from '../../src/concierge/panelSize';

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

describe('the remembered panel size', () => {
  it('round-trips both sizes', () => {
    for (const size of ['normal', 'minimized'] satisfies PanelSize[]) {
      const storage = fakeStorage();
      writePanelSize(storage, size);
      expect(readPanelSize(storage), size).toBe(size);
    }
  });

  it('opens at the normal size when nothing has been stored', () => {
    expect(readPanelSize(fakeStorage())).toBe('normal');
  });

  /* The key is shared with whatever else holds the origin's sessionStorage,
   * and a stored value outlives the code that wrote it. Anything unrecognised
   * is the default rather than a crash or a third state. */
  it('falls back to normal for a value it does not recognise', () => {
    for (const stored of ['maximized', '', 'MINIMIZED', '{"size":"minimized"}', 'null']) {
      expect(readPanelSize(fakeStorage({ 'jtv.concierge.size': stored })), stored).toBe('normal');
    }
  });

  it('falls back to normal when storage throws', () => {
    expect(readPanelSize(throwingStorage)).toBe('normal');
  });

  /* The embed passes no storage at all rather than branching at every call
   * site. */
  it('tolerates having no storage', () => {
    expect(readPanelSize(undefined)).toBe('normal');
    expect(() => writePanelSize(undefined, 'minimized')).not.toThrow();
  });

  it('does not throw when a write is refused', () => {
    expect(() => writePanelSize(throwingStorage, 'minimized')).not.toThrow();
  });
});
