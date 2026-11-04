import { loaderTextFor, type LoaderContext } from './loaderText';

type ChatLoaderProps = {
  context?: LoaderContext;
  translations?: { loaderText?: string };
  inline?: boolean;
};

/* The turn status, shown the old panel's way: three pulsing dots and the
 * phase text, overlaid on the composer zone (the old .connected-progress
 * pattern) instead of a skeleton block in the message stream. The loader
 * element is absolutely positioned from the panel so it pins above the
 * entry field regardless of scroll. */
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
