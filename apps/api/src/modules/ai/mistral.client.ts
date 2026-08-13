import { env } from '../../config/env';
import { createLogger } from '../../lib/logger/logger';

// Built on `fetch` rather than the vendor SDK: one POST buys us an explicit timeout,
// our own retry policy, and a seam that is trivial to stub in tests.

const log = createLogger('ai.mistral');

export type AiFailureKind = 'timeout' | 'provider_error';

/** Transport-level failure, carrying enough detail for the interaction log. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: AiFailureKind,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

interface MistralApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Retried statuses: rate limiting and transient server-side faults. */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Requests a chat completion; throws {@link AiProviderError} on timeout or once retries are exhausted. */
export async function createChatCompletion(
  messages: ChatMessageInput[],
  options: { jsonMode?: boolean; temperature?: number } = {},
): Promise<ChatCompletionResult> {
  if (!env.ai.isConfigured || !env.ai.apiKey) {
    throw new AiProviderError('AI provider is not configured', 'provider_error');
  }

  const body = {
    model: env.ai.model,
    messages,
    // Low but non-zero: extraction stays near-deterministic, prose still reads naturally.
    temperature: options.temperature ?? 0.2,
    max_tokens: 700,
    ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  let lastError: AiProviderError | null = null;

  for (let attempt = 0; attempt <= env.ai.maxRetries; attempt += 1) {
    try {
      return await sendRequest(body);
    } catch (error) {
      lastError = error instanceof AiProviderError ? error : new AiProviderError(
        error instanceof Error ? error.message : 'Unknown AI transport failure',
        'provider_error',
      );

      const canRetry =
        attempt < env.ai.maxRetries &&
        (lastError.kind === 'timeout' ||
          lastError.statusCode === undefined ||
          RETRYABLE_STATUS_CODES.has(lastError.statusCode));

      if (!canRetry) {
        break;
      }

      // Backoff ceiling is deliberately low: a user is waiting, so failing fast into
      // the form fallback beats a stall that looks like the product is broken.
      const backoffMs = Math.min(250 * 2 ** attempt, 1000);
      log.warn({ attempt, backoffMs, kind: lastError.kind }, 'Retrying AI request');
      await delay(backoffMs);
    }
  }

  throw lastError ?? new AiProviderError('AI request failed', 'provider_error');
}

async function sendRequest(body: unknown): Promise<ChatCompletionResult> {
  // Without this the socket is never torn down and a hung provider pins an Express request open.
  const signal = AbortSignal.timeout(env.ai.timeoutMs);

  let response: Response;

  try {
    response = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${env.ai.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new AiProviderError(`AI request timed out after ${env.ai.timeoutMs}ms`, 'timeout');
    }
    throw new AiProviderError(
      error instanceof Error ? error.message : 'Network failure calling AI provider',
      'provider_error',
    );
  }

  if (!response.ok) {
    // Text, not JSON: an upstream proxy returning HTML must not turn a 502 into a parse error.
    const detail = await response.text().catch(() => '');
    throw new AiProviderError(
      `AI provider responded ${response.status}: ${detail.slice(0, 200)}`,
      'provider_error',
      response.status,
    );
  }

  const payload = (await response.json()) as MistralApiResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new AiProviderError('AI provider returned an empty completion', 'provider_error');
  }

  return {
    content,
    promptTokens: payload.usage?.prompt_tokens ?? null,
    completionTokens: payload.usage?.completion_tokens ?? null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
