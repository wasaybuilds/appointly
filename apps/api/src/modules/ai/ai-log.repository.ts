import type { AiCallStatus } from '@appointly/shared';
import { query } from '../../db/pool';
import { createLogger } from '../../lib/logger/logger';

const log = createLogger('ai.log');

export interface AiInteractionLogInput {
  businessId: string;
  userId: string;
  sessionId: string;
  model: string;
  status: AiCallStatus;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown> | null;
  errorMessage: string | null;
}

export const aiLogRepository = {
  /** Records one model call; write failures are swallowed so observability cannot fail a booking. */
  async record(input: AiInteractionLogInput): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_interaction_logs (
           business_id, user_id, session_id, provider, model, status,
           latency_ms, prompt_tokens, completion_tokens,
           request_payload, response_payload, error_message
         )
         VALUES ($1, $2, $3, 'mistral', $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          input.businessId,
          input.userId,
          input.sessionId,
          input.model,
          input.status,
          Math.round(input.latencyMs),
          input.promptTokens,
          input.completionTokens,
          JSON.stringify(input.requestPayload),
          input.responsePayload ? JSON.stringify(input.responsePayload) : null,
          input.errorMessage,
        ],
      );
    } catch (error) {
      log.error({ err: error }, 'Failed to persist AI interaction log');
    }
  },
};
