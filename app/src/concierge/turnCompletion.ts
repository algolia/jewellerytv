type Message = { id?: string; role?: string; parts?: readonly unknown[] };
type Part = { type?: unknown; text?: unknown; state?: unknown; errorText?: unknown };

function latestAssistant(messages: readonly Message[]) {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return undefined;
  return [...messages]
    .slice(lastUser + 1)
    .reverse()
    .find((message) => message.role === 'assistant');
}

/** The SDK can report ready/onFinish after a capped tool round. Require a final text part. */
export function isCompletedAssistantTurn(messages: readonly Message[], status: string): boolean {
  if (status !== 'ready') return false;
  const assistant = latestAssistant(messages);
  if (!assistant?.parts?.length) return false;
  const parts = assistant.parts as Part[];
  let lastToolIndex = -1;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      if (part.state !== 'output-available' && part.state !== 'output-error') return false;
      lastToolIndex = index;
    }
  }
  const finalText = parts
    .slice(lastToolIndex + 1)
    .filter((part) => part.type === 'text' && part.state === 'done')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return !!finalText && !finalText.startsWith('[System notice]');
}

export type FailedToolDetail = { toolName: string; errorText: string };

/**
 * Every writer of a failed tool outcome commits the same part shape: a tool
 * part with state 'output-error' and an errorText, on the latest assistant
 * message. The writers are the SDK's per-client-tool timeout wrapper and
 * mid-tool abort (connectChat.js), the server's tool-input-error and
 * tool-output-error chunks (abstract-chat.js), and the restored-pending-part
 * repair on resume. One reader over that shape covers the whole class, so the
 * notice and the diagnostic log attribute failures consistently.
 */
export function getFailedToolDetails(messages: readonly Message[]): FailedToolDetail[] {
  const assistant = latestAssistant(messages);
  if (!assistant?.parts) return [];
  const details: FailedToolDetail[] = [];
  for (const part of assistant.parts as Part[]) {
    if (part.state !== 'output-error') continue;
    if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) continue;
    details.push({
      toolName: part.type.slice('tool-'.length) || 'unknown',
      errorText: typeof part.errorText === 'string' ? part.errorText : '',
    });
  }
  return details;
}

export function hasFailedTool(messages: readonly Message[]): boolean {
  return getFailedToolDetails(messages).length > 0;
}

/**
 * A turn the model recovered from a mid-turn tool failure: despite an
 * output-error part, it went on to produce a successful tool output and a
 * final answer. The SDK finishes such a turn normally (exact24 temp4 q10,
 * q23 and q24 captured this shape on 2026-10-21: one tool part failed, the
 * retry landed, the answer text arrived), and the shopper should see that
 * turn. Only a turn with no usable result keeps the failure notice. The
 * failed part itself is still reported by getFailedToolDetails for the
 * diagnostic log; this reader only decides whether the turn is shown.
 */
export function turnHasUsableResult(messages: readonly Message[]): boolean {
  const assistant = latestAssistant(messages);
  if (!assistant?.parts?.length) return false;
  const parts = assistant.parts as Part[];
  let hasSuccessfulToolOutput = false;
  let lastToolIndex = -1;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) continue;
    if (part.state === 'output-available') hasSuccessfulToolOutput = true;
    if (part.state === 'output-available' || part.state === 'output-error') lastToolIndex = index;
  }
  if (!hasSuccessfulToolOutput) return false;
  const finalText = parts
    .slice(lastToolIndex + 1)
    .filter((part) => part.type === 'text' && part.state === 'done')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return !!finalText && !finalText.startsWith('[System notice]');
}
