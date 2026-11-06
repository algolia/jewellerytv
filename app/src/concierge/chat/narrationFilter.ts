import { DefaultChatTransport } from 'instantsearch.js/es/lib/ai-lite';
import type { UIMessage } from 'instantsearch.js/es/lib/chat';
import { isFiller, isNarration } from './narration';

/* Drops narration before it reaches the transcript.
 *
 * The decision has to be made before the words render or the shopper watches
 * them appear and vanish — which is what a display rule did, and why it was
 * reverted. So it happens here, in the transport, on the chunk stream between
 * the network and the chat store.
 *
 * The unit is the sentence, not the block. An earlier cut judged each block
 * once, on its first fifty characters or its first sentence, and released
 * everything after that verdict unexamined. Measured 2026-11-05 on the class
 * battery, that is how two blocks reached the shopper:
 *
 *   "Perfect! Now I'll display these gold hoops."
 *   "I see these results are mostly silver with gold overlay and gemstones.
 *    Let me search for solid sterling silver hoops instead."
 *
 * Both open with something that is not narration — a one-word interjection,
 * a sentence about the results — so both were released at the first full
 * stop, and the announcement that followed streamed straight through. The
 * model writes the human moment and the narration in one block, so a verdict
 * per block can only be wrong in one direction or the other.
 *
 * So each sentence is held until it is complete, judged on its own, and then
 * either emitted or dropped. A block whose every sentence is narration never
 * opens: no `text-start`, no `text-end`, nothing in the transcript. A block
 * that mixes them renders the half that speaks to the shopper.
 *
 * The cost is that text arrives a sentence at a time rather than a word at a
 * time. That is the same granularity the reply is written in, and the panel
 * already waits seconds on the display tool, so it reads as prose appearing
 * rather than as a stall.
 *
 * Non-text chunks are never held: tool calls, data parts and the rest pass
 * through untouched. */

/** A sentence and its trailing space, which is how the text is re-joined. */
const SENTENCE = /[^.!?]+[.!?]+\s*/;

type Chunk = { type?: string; id?: string; delta?: string } & Record<string, unknown>;

type Pending = {
  /** Held until the first surviving sentence, so a fully narrated block
   * never opens a part in the transcript at all. */
  start: Chunk | null;
  /** Text arrived but not yet ending on a sentence boundary. */
  buffer: string;
  /** Interjections waiting for a sentence to belong to. "Perfect!" in front
   * of a real line is fine; alone over three shelves it is the whole voice,
   * and it says less than letting the display tool's intro stand in. */
  filler: string;
  opened: boolean;
};

export function filterNarration(stream: ReadableStream<Chunk>): ReadableStream<Chunk> {
  const pending = new Map<string, Pending>();

  /** Emits one sentence, opening the part first if this is the first to
   * survive. Narration is dropped without a trace. */
  function emit(
    id: string,
    held: Pending,
    sentence: string,
    controller: TransformStreamDefaultController<Chunk>,
  ) {
    if (!sentence.trim() || isNarration(sentence)) return;
    if (isFiller(sentence)) {
      held.filler += sentence;
      return;
    }
    if (!held.opened) {
      if (held.start) controller.enqueue(held.start);
      held.opened = true;
    }
    /* The interjection rides out in front of the sentence it was waiting
     * for, in the order the model wrote them. */
    const text = held.filler + sentence;
    held.filler = '';
    controller.enqueue({ type: 'text-delta', id, delta: text });
  }

  /** Drains every complete sentence out of the buffer, leaving the tail. */
  function drain(id: string, held: Pending, controller: TransformStreamDefaultController<Chunk>) {
    for (;;) {
      const match = SENTENCE.exec(held.buffer);
      if (!match || match.index !== 0) break;
      held.buffer = held.buffer.slice(match[0].length);
      emit(id, held, match[0], controller);
    }
  }

  /** The block has ended: the tail is a last sentence without punctuation,
   * judged the same way. */
  function close(id: string, controller: TransformStreamDefaultController<Chunk>, end?: Chunk) {
    const held = pending.get(id);
    if (!held) return;
    pending.delete(id);
    drain(id, held, controller);
    if (held.buffer) emit(id, held, held.buffer, controller);
    if (held.opened && end) controller.enqueue(end);
  }

  return stream.pipeThrough(
    new TransformStream<Chunk, Chunk>({
      transform(chunk, controller) {
        const id = typeof chunk?.id === 'string' ? chunk.id : undefined;

        if (chunk?.type === 'text-start' && id) {
          pending.set(id, { start: chunk, buffer: '', filler: '', opened: false });
          return;
        }

        if (chunk?.type === 'text-delta' && id) {
          const held = pending.get(id);
          /* A delta with no start before it: nothing to judge against, so it
           * passes rather than disappearing. */
          if (!held) {
            controller.enqueue(chunk);
            return;
          }
          held.buffer += chunk.delta ?? '';
          drain(id, held, controller);
          return;
        }

        if (chunk?.type === 'text-end' && id) {
          close(id, controller, chunk);
          return;
        }

        controller.enqueue(chunk);
      },
      /* A stream that ends mid-block must not swallow what it was holding. */
      flush(controller) {
        for (const id of [...pending.keys()]) close(id, controller);
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
