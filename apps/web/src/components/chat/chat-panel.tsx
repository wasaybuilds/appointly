'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  SOCKET_EVENTS,
  type Appointment,
  type AssistantTypingPayload,
  type BookingResult,
  type BookingUpdatedPayload,
  type ChatMessage,
} from '@appointly/shared';
import { toDisplayMessage } from '@/lib/api/api-error';
import { catalogApi, chatApi, metaApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils/cn';
import { useSocket } from '@/hooks/use-socket';
import { Alert } from '@/components/ui/feedback';
import { Loading } from '@/components/ui/loading';
import { BookingPanel } from './booking-panel';
import { ChatComposer } from './chat-composer';
import { MessageBubble, TypingIndicator } from './message-bubble';

/*
  The transcript is derived during render from the session query (the server's
  authoritative history) plus a buffer of messages that arrived since. Copying
  server data into state via an effect is the standard way to end up with two
  sources of truth that drift apart.
*/

/** Concrete openers, shown only on an empty transcript, so a new user is not staring at a blank box. */
const STARTERS = [
  'Book a dental check-up next Tuesday at 3pm',
  'I need a haircut on Friday morning',
  'What times are free tomorrow?',
] as const;

const GREETING: ChatMessage = {
  id: 'greeting',
  sessionId: 'greeting',
  role: 'assistant',
  content:
    'Hi! I can book an appointment for you. Tell me what you need and when suits you — for example, "a dental check-up next Tuesday at 3pm".',
  createdAt: new Date().toISOString(),
};

const PLACEHOLDER_ID_PREFIX = 'optimistic-';

function isPlaceholder(message: ChatMessage): boolean {
  return message.id.startsWith(PLACEHOLDER_ID_PREFIX);
}

/**
 * Merges incoming messages into the transcript, de-duplicating by id and
 * retiring any placeholder the incoming batch has just superseded.
 *
 * A placeholder cannot be matched by id — it carries a client-generated one
 * while the persisted row carries the server's. The server broadcasts the
 * user's own message as soon as it is saved, well before the assistant has
 * replied, so id de-duplication alone leaves the sender looking at their
 * message twice for as long as the model takes to answer.
 *
 * Matching is against the incoming batch rather than the whole transcript, so
 * repeating the same message later still shows a placeholder for the new send.
 */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const identity = (message: ChatMessage): string => `${message.role}:${message.content}`;

  const superseded = new Set(incoming.filter((message) => !isPlaceholder(message)).map(identity));

  const retained = current.filter(
    (message) => !isPlaceholder(message) || !superseded.has(identity(message)),
  );

  const byId = new Map(retained.map((message) => [message.id, message]));

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function ChatPanel() {
  const queryClient = useQueryClient();

  /** Messages received since the session query resolved. */
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const transcriptRef = useRef<HTMLDivElement>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.chat.activeSession,
    queryFn: chatApi.startSession,
    // Creating or resuming a session is a write; it must not re-run on remount.
    staleTime: Infinity,
    retry: false,
  });

  const servicesQuery = useQuery({
    queryKey: queryKeys.services,
    queryFn: catalogApi.listServices,
    staleTime: 5 * 60_000,
  });

  const metaQuery = useQuery({
    queryKey: queryKeys.meta,
    queryFn: metaApi.get,
    staleTime: 5 * 60_000,
  });

  const sessionId = sessionQuery.data?.session.id ?? null;

  const messages = useMemo(
    () => mergeMessages(sessionQuery.data?.messages ?? [], liveMessages),
    [sessionQuery.data, liveMessages],
  );

  const sendMutation = useMutation({
    mutationFn: (content: string) => {
      if (!sessionId) {
        throw new Error('No conversation is open yet.');
      }
      return chatApi.sendMessage(sessionId, content);
    },
    onSuccess: (turn) => {
      setLiveMessages((current) =>
        mergeMessages(current, [turn.userMessage, turn.assistantMessage]),
      );
      setBooking(turn.booking);

      if (turn.booking.appointment) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      }
    },
    onError: (error) => {
      setSendError(toDisplayMessage(error));
    },
  });

  const socketHandlers = useMemo(
    () => ({
      [SOCKET_EVENTS.MESSAGE_CREATED]: (message: ChatMessage) => {
        setLiveMessages((current) => mergeMessages(current, [message]));
      },
      [SOCKET_EVENTS.ASSISTANT_TYPING]: ({ isTyping }: AssistantTypingPayload) => {
        setIsAssistantTyping(isTyping);
      },
      [SOCKET_EVENTS.BOOKING_UPDATED]: ({ booking: update }: BookingUpdatedPayload) => {
        setBooking(update);
      },
    }),
    [],
  );

  useSocket(socketHandlers, sessionId);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const element = transcriptRef.current;
    if (!element) return;

    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messages, isAssistantTyping]);

  const handleSend = useCallback(
    (content: string) => {
      setSendError(null);

      // Shown immediately so the message appears the instant it is sent;
      // `mergeMessages` retires it as soon as the persisted row arrives.
      const optimistic: ChatMessage = {
        id: `${PLACEHOLDER_ID_PREFIX}${Date.now()}`,
        sessionId: sessionId ?? '',
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      setLiveMessages((current) => mergeMessages(current, [optimistic]));
      setIsAssistantTyping(true);

      sendMutation.mutate(content, {
        onSettled: () => {
          setIsAssistantTyping(false);
          // Normally already retired by the merge; this covers a failed send,
          // where no persisted row ever arrives to supersede it.
          setLiveMessages((current) => current.filter((message) => message.id !== optimistic.id));
        },
      });
    },
    [sessionId, sendMutation],
  );

  const handleBooked = useCallback(
    (appointment: Appointment) => {
      setBooking({
        outcome: 'booked',
        missingFields: [],
        reason: null,
        prefill: null,
        appointment,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
    [queryClient],
  );

  if (sessionQuery.isLoading || servicesQuery.isLoading) {
    return <Loading variant="page" label="Starting your conversation" />;
  }

  if (sessionQuery.isError) {
    return (
      <Alert tone="danger" title="Could not open the assistant">
        {toDisplayMessage(sessionQuery.error)}
      </Alert>
    );
  }

  const aiEnabled = metaQuery.data?.aiEnabled ?? true;
  const isEmptyTranscript = messages.length === 0;
  const transcript = isEmptyTranscript ? [GREETING] : messages;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section
        aria-label="Conversation"
        className="border-ink-15 flex h-[calc(100dvh-9rem)] min-h-[30rem] flex-col overflow-hidden rounded-md border"
      >
        <header className="border-ink-15 flex items-center gap-3 border-b px-5 py-3.5">
          <span className="bg-ink text-paper flex size-8 items-center justify-center rounded-md">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-sm font-semibold">Booking assistant</h1>
            <p className="text-ink-50 truncate text-xs">
              {aiEnabled
                ? 'Ask for an appointment in your own words'
                : 'Offline — use the booking form on the right'}
            </p>
          </div>
          <span className="text-ink-50 hidden items-center gap-1.5 text-[0.6875rem] sm:flex">
            <span
              className={cn('size-1.5 rounded-full', aiEnabled ? 'bg-accent' : 'bg-ink-30')}
              aria-hidden="true"
            />
            {aiEnabled ? 'Online' : 'Fallback'}
          </span>
        </header>

        {!aiEnabled ? (
          <div className="border-ink-15 bg-ink-04 text-ink-70 border-b px-5 py-2.5 text-xs">
            The AI assistant is not configured, so replies are limited. The booking form works
            normally.
          </div>
        ) : null}

        <div
          ref={transcriptRef}
          className="scrollbar-slim flex-1 space-y-5 overflow-y-auto px-5 py-6"
        >
          {transcript.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isEmptyTranscript ? (
            <div className="animate-rise pt-2 pl-10">
              <p className="label-micro mb-2.5">Try one of these</p>
              <div className="flex flex-wrap gap-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    disabled={!sessionId}
                    onClick={() => handleSend(starter)}
                    className="border-ink-15 text-ink-70 hover:border-ink hover:text-ink rounded-md border px-3 py-1.5 text-[0.8125rem] transition-colors disabled:opacity-40"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {isAssistantTyping ? <TypingIndicator /> : null}

          {sendError ? (
            <Alert tone="danger" className="mx-auto max-w-md">
              {sendError}
            </Alert>
          ) : null}
        </div>

        <ChatComposer
          onSend={handleSend}
          isSending={sendMutation.isPending}
          disabled={!sessionId}
        />
      </section>

      <aside aria-label="Booking details" className="lg:sticky lg:top-[5.25rem] lg:self-start">
        <BookingPanel
          booking={booking}
          services={servicesQuery.data ?? []}
          sessionId={sessionId}
          aiEnabled={aiEnabled}
          onBooked={handleBooked}
        />
      </aside>
    </div>
  );
}
