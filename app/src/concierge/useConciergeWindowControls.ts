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

  const currentRect = useCallback((): WindowRect => {
    if (rect) return rect;
    const bounds = panelRef.current?.getBoundingClientRect();
    return bounds
      ? clampWindowRect(
          { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
          viewport(),
        )
      : defaultWindowRect(viewport());
  }, [rect]);

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
