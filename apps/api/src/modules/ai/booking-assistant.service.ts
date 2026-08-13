import {
  AI_MEMORY_WINDOW_SIZE,
  assistantResponseSchema,
  type AiCallStatus,
  type AssistantResponse,
  type ChatMessage,
  type Service,
} from '@appointly/shared';
import { env } from '../../config/env';
import { createLogger } from '../../lib/logger/logger';
import type { BusinessHours } from '../appointments/scheduling.service';
import { aiLogRepository } from './ai-log.repository';
import { buildBookingSystemPrompt } from './booking-prompt';
import { buildFallbackResponse } from './fallback-assistant';
import {
  AiProviderError,
  createChatCompletion,
  type ChatMessageInput,
} from './mistral.client';

const log = createLogger('ai.assistant');

export interface AssistantTurnContext {
  businessId: string;
  userId: string;
  sessionId: string;
  /** Prior turns, oldest first. Trimmed to the memory window before sending. */
  history: ChatMessage[];
  userMessage: string;
  services: Service[];
  hours: BusinessHours;
  customerName: string;
  customerEmail: string;
}

export interface AssistantTurnResult {
  response: AssistantResponse;
  /** True when the reply came from the deterministic fallback, not the model. */
  degraded: boolean;
}

export const bookingAssistant = {
  /** Replies for one turn. Never throws: every AI failure degrades to the deterministic fallback. */
  async respond(context: AssistantTurnContext): Promise<AssistantTurnResult> {
    if (!env.ai.isConfigured) {
      log.warn('AI provider is not configured; using deterministic fallback');
      return {
        response: buildFallbackResponse(context.userMessage, context.services, 'not_configured'),
        degraded: true,
      };
    }

    const messages = buildMessages(context);
    const startedAt = performance.now();

    try {
      const completion = await createChatCompletion(messages, { jsonMode: true });
      const latencyMs = performance.now() - startedAt;

      const parsed = parseAssistantJson(completion.content);

      if (!parsed) {
        await recordCall(context, {
          status: 'invalid_output',
          latencyMs,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          responsePayload: { raw: completion.content.slice(0, 500) },
          errorMessage: 'Model output was not valid JSON matching the assistant schema',
        });

        log.warn({ sessionId: context.sessionId }, 'Discarded malformed assistant output');

        return {
          response: buildFallbackResponse(
            context.userMessage,
            context.services,
            'provider_failure',
          ),
          degraded: true,
        };
      }

      await recordCall(context, {
        status: 'success',
        latencyMs,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        responsePayload: {
          intent: parsed.intent,
          readyToBook: parsed.readyToBook,
          confidence: parsed.confidence,
          missingFields: parsed.missingFields,
        },
        errorMessage: null,
      });

      return { response: parsed, degraded: false };
    } catch (error) {
      const latencyMs = performance.now() - startedAt;
      const status: AiCallStatus =
        error instanceof AiProviderError && error.kind === 'timeout' ? 'timeout' : 'provider_error';

      await recordCall(context, {
        status,
        latencyMs,
        promptTokens: null,
        completionTokens: null,
        responsePayload: null,
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown AI failure',
      });

      log.error({ err: error, sessionId: context.sessionId }, 'AI call failed, falling back');

      return {
        response: buildFallbackResponse(context.userMessage, context.services, 'provider_failure'),
        degraded: true,
      };
    }
  },
};

/** Sends only the tail of the transcript: prompt size drives latency and cost. */
function buildMessages(context: AssistantTurnContext): ChatMessageInput[] {
  const systemPrompt = buildBookingSystemPrompt({
    services: context.services,
    hours: context.hours,
    customerName: context.customerName,
    customerEmail: context.customerEmail,
    now: new Date(),
  });

  const recent = context.history.slice(-AI_MEMORY_WINDOW_SIZE);

  const historyMessages: ChatMessageInput[] = recent
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));

  return [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: context.userMessage },
  ];
}

/** Extracts the first balanced object (JSON mode can still wrap output in prose) and schema-validates it. */
function parseAssistantJson(raw: string): AssistantResponse | null {
  const candidate = extractJsonObject(raw);

  if (!candidate) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }

  const result = assistantResponseSchema.safeParse(parsed);

  return result.success ? result.data : null;
}

/** Returns the substring between the first `{` and its matching `}`. */
function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');

  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    // Braces inside string literals must not affect nesting depth.
    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
}

/** Writes the interaction log entry for one call. */
async function recordCall(
  context: AssistantTurnContext,
  details: {
    status: AiCallStatus;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    responsePayload: Record<string, unknown> | null;
    errorMessage: string | null;
  },
): Promise<void> {
  await aiLogRepository.record({
    businessId: context.businessId,
    userId: context.userId,
    sessionId: context.sessionId,
    model: env.ai.model,
    status: details.status,
    latencyMs: details.latencyMs,
    promptTokens: details.promptTokens,
    completionTokens: details.completionTokens,
    // Preview only: debugging a bad extraction must not duplicate the conversation in the log table.
    requestPayload: {
      messageCount: context.history.length + 1,
      userMessagePreview: context.userMessage.slice(0, 200),
      serviceCount: context.services.length,
    },
    responsePayload: details.responsePayload,
    errorMessage: details.errorMessage,
  });
}
