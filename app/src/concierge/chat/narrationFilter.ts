import { DefaultChatTransport } from 'instantsearch.js/es/lib/ai-lite';
import type { UIMessage } from 'instantsearch.js/es/lib/chat';
import { isNarration } from './narration';

/* Drops narration before it reaches the transcript.
 *
 * The decision has to be made before the words render or the shopper watches
 * them appear and vanish — which is what a display rule did, and why it was
 * reverted. So it happens here, in the transport, on the chunk stream between
 * the network and the chat store.
 *
 * Each text block is held until there is enough of it to judge: about fifty
 * characters, or the end of the first sentence, or the end of the block,
 * whichever comes first. Narration is recognisable long before then — "I'll
 * search for garnet pendants" is twenty-seven. If the block is narration, it
 * and every delta after it are dropped and the transcript never sees it. If
 * it is not, the held text is released in one chunk and the rest streams
 * through as it arrives, so a reply starts rendering a few tokens later than
 * it would have and nothing else changes.
 *
 * Non-text chunks are never held: tool calls, data parts and the rest pass
 * through untouched. */

const DECIDE_AT = 48;

type Chunk = { type?: string; id?: string; delta?: string } & Record<string, unknown>;

type Pending = { start: Chunk; text: string };

export function filterNarration(stream: ReadableStream<Chunk>): ReadableStream<Chunk> {
  const pending = new Map<string, Pending>();
  const suppressed = new Set<string>();

  /* Judge a held block, then either release what is held or mark the id
   * suppressed for the rest of its deltas. */
  function settle(id: string, controller: TransformStreamDefaultController<Chunk>) {
    const held = pending.get(id);
    if (!held) return;
    pending.delete(id);
    if (isNarration(held.text)) {
      suppressed.add(id);
      return;
    }
    controller.enqueue(held.start);
    if (held.text) controller.enqueue({ type: 'text-delta', id, delta: held.text });
  }

  return stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        const id = typeof chunk?.id === 'string' ? chunk.id : undefined;

        if (chunk?.type === 'text-start' && id) {
          pending.set(id, { start: chunk, text: '' });
          return;
        }

        if (chunk?.type === 'text-delta' && id) {
          if (suppressed.has(id)) return;
          const held = pending.get(id);
          if (!held) {
            controller.enqueue(chunk);
            return;
          }
          held.text += chunk.delta ?? '';
          if (held.text.length >= DECIDE_AT || /[.!?]/.test(held.text)) settle(id, controller);
          return;
        }

        if (chunk?.type === 'text-end' && id) {
          /* A block shorter than the threshold reaches its end undecided. */
          if (pending.has(id)) settle(id, controller);
          if (suppressed.has(id)) {
            suppressed.delete(id);
            return;
          }
          controller.enqueue(chunk);
          return;
        }

        controller.enqueue(chunk);
      },
      /* A stream that ends mid-block must not swallow what it was holding. */
      flush(controller) {
        for (const id of [...pending.keys()]) settle(id, controller);
      },
    }),
  );
}

/** The transport the panel uses: `DefaultChatTransport` with the narration
 * filter spliced into the chunk stream.
 *
 * The chunk union is generated per message type and is wider than anything
 * this filter inspects — it reads `type`, `id` and `delta` and forwards
 * everything else untouched — so the stream is cast across the splice rather
 * than the union restated. */
export class NarrationFilteringTransport<
  TMessage extends UIMessage,
> extends DefaultChatTransport<TMessage> {
  async sendMessages(
    ...args: Parameters<DefaultChatTransport<TMessage>['sendMessages']>
  ): ReturnType<DefaultChatTransport<TMessage>['sendMessages']> {
    const stream = await super.sendMessages(...args);
    return filterNarration(stream as unknown as ReadableStream<Chunk>) as unknown as Awaited<
      ReturnType<DefaultChatTransport<TMessage>['sendMessages']>
    >;
  }
}
