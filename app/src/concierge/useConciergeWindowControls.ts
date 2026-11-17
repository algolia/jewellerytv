import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react';
import type { PanelSize } from './panelState';
import {
  clampWindowRect,
  defaultWindowRect,
  moveWindowRect,
  resizeWindowRect,
  type WindowRect,
} from './windowGeometry';

type Interaction = {
  pointerId: number;
  kind: 'move' | 'resize';
  startX: number;
  startY: number;
  rect: WindowRect;
};

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/* A collapsed bar can be moved but not resized: there is nothing to resize,
 * and parking it somewhere else is the main thing a shopper wants to do with
 * it. Dragging was gated to the expanded panel when collapse shipped, which
 * left the bar pinned — its whole width is the restore target, so a pointer
 * could only ever reopen it. */
export function useConciergeWindowControls(size: PanelSize) {
  const panelRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const [rect, setRect] = useState<WindowRect | null>(null);
  const resizable = size === 'normal';
  /* Set once a pointer has travelled far enough to be a drag. The bar's own
   * click restores the panel, and releasing a drag must not count as one. */
  const dragged = useRef(false);
  /* The height the panel actually had while expanded. The geometry default
   * is a reasonable guess but not this panel's guess: the stylesheet sizes
   * it from the viewport, so restoring to the default visibly resizes a
   * panel the shopper never resized. */
  const lastNormalHeight = useRef<number | null>(null);

  /* Collapsed, the panel measures about 50px, and a drag that captured that
   * as the rect's height left the restored panel 360px tall — the geometry
   * floor, applied on the way back up. The bar carries the position; the
   * height it would report is not a height anyone chose, so the last one
   * that was is kept instead. */
  const currentRect = useCallback((): WindowRect => {
    const keptHeight =
      rect?.height ?? lastNormalHeight.current ?? defaultWindowRect(viewport()).height;
    if (rect) return resizable ? rect : { ...rect, height: keptHeight };
    const bounds = panelRef.current?.getBoundingClientRect();
    return bounds
      ? clampWindowRect(
          {
            x: bounds.left,
            y: bounds.top,
            width: bounds.width,
            height: resizable ? bounds.height : keptHeight,
          },
          viewport(),
        )
      : defaultWindowRect(viewport());
  }, [rect, resizable]);

  const begin = useCallback(
    (kind: Interaction['kind'], event: PointerEvent<HTMLElement>) => {
      if (window.matchMedia('(max-width: 767px)').matches || event.button !== 0) return;
      if (kind === 'resize' && !resizable) return;
      event.preventDefault();
      dragged.current = false;
      interaction.current = {
        pointerId: event.pointerId,
        kind,
        startX: event.clientX,
        startY: event.clientY,
        rect: currentRect(),
      };
    },
    [currentRect, resizable],
  );

  const beginHeaderMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('button, a, input, select, textarea, [role="button"]')
      )
        return;
      begin('move', event);
    },
    [begin],
  );

  /* Watched rather than measured on a render, because the panel is `hidden`
   * until the shopper opens it: a one-shot read at mount sees zero, and the
   * size never changes on the way to being visible. The observer catches
   * the reveal, a resize by the grip, and a viewport change alike. */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (size !== 'normal') return;
      const measured = panel.getBoundingClientRect().height;
      if (measured > 100) lastNormalHeight.current = measured;
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [size]);

  useEffect(() => {
    function onPointerMove(event: globalThis.PointerEvent) {
      const active = interaction.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      /* Four pixels of slack, so a shaky click on the bar still reopens it. */
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged.current = true;
      setRect(
        active.kind === 'move'
          ? moveWindowRect(active.rect, dx, dy, viewport())
          : resizeWindowRect(active.rect, dx, dy, viewport()),
      );
    }
    function endInteraction(event: globalThis.PointerEvent) {
      if (interaction.current?.pointerId === event.pointerId) interaction.current = null;
    }
    function onResize() {
      const currentViewport = viewport();
      /* Below the breakpoint the panel is full-screen by stylesheet, and an
       * inline rect from a desktop drag would override it. Dropping the rect
       * rather than returning early is what keeps the mobile layout honest
       * after a window is narrowed. */
      if (currentViewport.width < 768) {
        setRect(null);
        return;
      }
      setRect((current) => (current ? clampWindowRect(current, currentViewport) : current));
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endInteraction);
    window.addEventListener('pointercancel', endInteraction);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endInteraction);
      window.removeEventListener('pointercancel', endInteraction);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  function handleResizeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const distances: Record<string, [number, number]> = {
      ArrowUp: [0, -24],
      ArrowDown: [0, 24],
      ArrowLeft: [-24, 0],
      ArrowRight: [24, 0],
    };
    const delta = distances[event.key];
    if (!delta || !resizable) return;
    event.preventDefault();
    const scale = event.shiftKey ? 3 : 1;
    setRect(resizeWindowRect(currentRect(), delta[0] * scale, delta[1] * scale, viewport()));
  }

  /* A collapsed bar keeps the corner the shopper dragged it to but must not
   * keep the card's height, or it renders as an empty box with a title in it.
   * Dropping `height` lets the bar shrink-wrap its own content while `left`
   * and `top` hold it in place. */
  const style = !rect
    ? undefined
    : size === 'normal'
      ? {
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          right: 'auto',
          bottom: 'auto',
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          maxHeight: 'none',
        }
      : {
          left: `${rect.x}px`,
          top: `${rect.y}px`,
          right: 'auto',
          bottom: 'auto',
          width: `${rect.width}px`,
        };

  return {
    panelRef,
    style,
    /* Read by the bar's click handler, which must not fire after a drag. */
    wasDragged: () => dragged.current,
    beginHeaderMove,
    beginResize: (event: PointerEvent<HTMLElement>) => begin('resize', event),
    handleResizeKeyDown,
  };
}
