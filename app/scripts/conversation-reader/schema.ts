import { z } from 'zod';

/**
 * Boundary schemas for Agent Studio conversation API responses (brief A2).
 * Tolerant by design: known part types get typed fields, anything unknown
 * falls through to UnknownPartSchema so it is counted and shown, never dropped.
 */

export const ToolCallPartSchema = z.looseObject({
  type: z.literal('tool-call'),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  args: z.unknown().optional(),
  rawArgs: z.unknown().optional(),
});

export const ToolResultPartSchema = z.looseObject({
  type: z.literal('tool-result'),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  output: z
    .looseObject({
      type: z.string().optional(),
      value: z.unknown().optional(),
    })
    .optional(),
});

export const TextPartSchema = z.looseObject({
  type: z.literal('text'),
  text: z.string().optional(),
});

export const StartStepPartSchema = z.looseObject({
  type: z.literal('start-step'),
});

export const UnknownPartSchema = z.looseObject({
  type: z.string(),
});

export const PartSchema = z.union([
  ToolCallPartSchema,
  ToolResultPartSchema,
  TextPartSchema,
  StartStepPartSchema,
  UnknownPartSchema,
]);

export const MessageSchema = z.looseObject({
  role: z.string(),
  createdAt: z.string().optional(),
  parts: z.array(PartSchema),
  totalTokens: z.number().optional(),
});

export const ConversationSchema = z.looseObject({
  id: z.string(),
  agentId: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastActivityAt: z.string().nullish(),
  messageCount: z.number().optional(),
  totalTokens: z.number().optional(),
  messages: z.array(MessageSchema),
});

export const ConversationListItemSchema = z.looseObject({
  id: z.string(),
  agentId: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastActivityAt: z.string().nullish(),
  messageCount: z.number().optional(),
  totalInputTokens: z.number().optional(),
  totalOutputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
});

export const ConversationListSchema = z.object({
  data: z.array(ConversationListItemSchema),
});

export type ToolCallPart = z.infer<typeof ToolCallPartSchema>;
export type ToolResultPart = z.infer<typeof ToolResultPartSchema>;
export type TextPart = z.infer<typeof TextPartSchema>;
export type Part = z.infer<typeof PartSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationListItem = z.infer<typeof ConversationListItemSchema>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
