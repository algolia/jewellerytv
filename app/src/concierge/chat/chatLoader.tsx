import { loaderTextFor, type LoaderContext } from './loaderText';

type ChatLoaderProps = {
  context?: LoaderContext;
  translations?: { loaderText?: string };
  inline?: boolean;
};

/* The library's default loader draws two grey skeleton bars under the status
 * word — the "dumb gray progress bar" Arijit rejected (2026-11-04). The
 * previous panel spoke its progress as a line of text in the conversation,
 * so this loader renders only the phase-aware status the widget already
 * computes (Searching… / Choosing pieces… / Thinking…). Presentation only:
 * the wiring, phases and text rules are the library's and loaderText's. */
export function ChatLoader({ translations, context }: ChatLoaderProps) {
  const text = translations?.loaderText || loaderTextFor(context);
  return <p className="jtv-chat-loader">{text}</p>;
}
