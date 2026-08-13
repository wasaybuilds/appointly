import type { AssistantResponse, Service } from '@appointly/shared';

/** Rule-based reply used when the model is unreachable, so a customer can always still book. */
export function buildFallbackResponse(
  userMessage: string,
  services: Service[],
  reason: 'not_configured' | 'provider_failure',
): AssistantResponse {
  const matched = matchServiceName(userMessage, services);

  const reply =
    reason === 'not_configured'
      ? 'The AI assistant is not switched on right now, but you can still book in a few seconds using the booking form.'
      : "I'm having trouble understanding that at the moment. Let's use the booking form instead — it takes just a few seconds.";

  return {
    reply: matched
      ? `${reply} I've pre-selected ${matched.name} for you.`
      : reply,
    intent: 'unknown',
    booking: {
      serviceName: matched?.name ?? null,
      startsAt: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      notes: null,
    },
    missingFields: ['startsAt'],
    // Never books: no time was understood, and guessing one is far worse than asking.
    readyToBook: false,
    confidence: 0,
  };
}

/** Longest match first, so "check" does not win over "Dental Check-up". */
function matchServiceName(message: string, services: Service[]): Service | null {
  const haystack = message.toLowerCase();

  const candidates = services
    .filter((service) => service.isActive && haystack.includes(service.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);

  return candidates[0] ?? null;
}
