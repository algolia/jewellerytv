import { createPortal } from 'react-dom';
import { loaderTextFor, type LoaderContext } from './loaderText';

type ChatLoaderProps = {
  context?: LoaderContext;
  translations?: { loaderText?: string };
  inline?: boolean;
};

/* The turn status, shown the old panel's way: three pulsing dots and the
 * phase text, overlaid on the composer zone (the old .connected-progress
 * pattern). The library mounts this loader inside the last message article,
 * which is position:relative and would capture an absolutely positioned
 * child — so the status is portaled to the panel shell, whose coordinates
 * the overlay's CSS assumes. */
export function ChatLoader({ translations, context }: ChatLoaderProps) {
  const label = translations?.loaderText || loaderTextFor(context);
  const shell = document.querySelector('.jtv-concierge');
  const status = (
    <p className="jtv-chat-loader" role="status">
      <span className="jtv-chat-loader-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </p>
  );
  /* Outside the panel shell (pre-mount), render in place — the shell exists
   * for every streamed turn, which is the only time a loader shows. */
  return shell ? createPortal(status, shell) : status;
}
