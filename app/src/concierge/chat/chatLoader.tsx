import { loaderTextFor, type LoaderContext } from './loaderText';

type ChatLoaderProps = {
  context?: LoaderContext;
  translations?: { loaderText?: string };
  inline?: boolean;
};

/* The turn status, shown in the message stream right under the shopper's
 * question (Arijit, 2026-11-05, with the Vuori reference): three big pulsing
 * dots and the phase label, exactly where the answer will land. The library
 * mounts this component inside the last assistant message article, which is
 * the position we want — the earlier composer overlay (a714de6) is retired. */
export function ChatLoader({ translations, context }: ChatLoaderProps) {
  const label = translations?.loaderText || loaderTextFor(context);
  return (
    <p className="jtv-chat-loader" role="status">
      <span className="jtv-chat-loader-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </p>
  );
}
