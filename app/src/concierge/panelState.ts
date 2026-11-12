/* What the panel looked like when the shopper last touched it.
 *
 * Two things outlive a page load: whether the panel was open, and whether it
 * was collapsed to its title bar. Both are choices the shopper made, and a
 * refresh is not a request to undo them — having to find the Ask JTV chip
 * again after every reload is the complaint this exists to answer.
 *
 * The conversation itself does not survive: the chat instance is a `useMemo`
 * in `chat/JtvChat`. So a restored panel comes back on its welcome screen
 * rather than mid-thread. That is the ordinary empty state, which is why
 * reopening is safe — nothing claims the thread was kept.
 *
 * `minimized` replaced a full-height `maximized` on 2026-11-12: the control
 * JTV asked for restores a collapsed bar, and a third size nobody asked for
 * was carrying a dead branch through the drag hook and the stylesheet. */
export type PanelSize = 'normal' | 'minimized';
export type PanelState = { open: boolean; size: PanelSize };

const KEY = 'jtv.concierge.panel';
const CLOSED: PanelState = { open: false, size: 'normal' };

/* Storage access throws rather than returning null: Safari in private mode
 * and partitioned storage inside the embed frame both raise on the property
 * read. A panel that cannot remember its shape is a smaller problem than a
 * panel that cannot render, so every failure lands on the default. */
export function readPanelState(storage: Storage | undefined): PanelState {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return CLOSED;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return CLOSED;
    const { open, size } = parsed as Partial<PanelState>;
    return { open: open === true, size: size === 'minimized' ? 'minimized' : 'normal' };
  } catch {
    return CLOSED;
  }
}

export function writePanelState(storage: Storage | undefined, state: PanelState): void {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Nothing to do, and nothing worth telling the shopper. */
  }
}
