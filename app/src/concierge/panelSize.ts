/* The panel is one of two sizes, and the shopper chooses which.
 *
 * `normal` is the docked card. `minimized` collapses it to its title bar,
 * which stays where the panel was so one click brings the conversation back.
 * The pair replaced a full-height `maximized` state on 2026-11-12: the
 * control JTV asked for restores a collapsed bar, and a third size nobody
 * asked for was carrying a dead branch through the drag hook and the CSS.
 *
 * The size outlives a reload because closing the tab is not the same as
 * wanting the panel back at full size. The conversation does not survive a
 * reload — the chat instance is a `useMemo` — so `open` deliberately is not
 * stored with it: reopening on its own would present an empty panel as a
 * resumed one. */
export type PanelSize = 'normal' | 'minimized';

const KEY = 'jtv.concierge.size';

/* Storage access throws, it does not merely return null: Safari in private
 * mode and partitioned storage inside the embed frame both raise on the
 * property read. A panel that cannot remember its size is a smaller problem
 * than a panel that cannot render. */
export function readPanelSize(storage: Storage | undefined): PanelSize {
  try {
    return storage?.getItem(KEY) === 'minimized' ? 'minimized' : 'normal';
  } catch {
    return 'normal';
  }
}

export function writePanelSize(storage: Storage | undefined, size: PanelSize): void {
  try {
    storage?.setItem(KEY, size);
  } catch {
    /* Nothing to do and nothing worth telling the shopper. */
  }
}
