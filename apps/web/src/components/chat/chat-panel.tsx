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

type MobileView = 'chat' | 'booking';

const MOBILE_VIEWS = [
  { value: 'chat', label: 'Conversation' },
  { value: 'booking', label: 'Booking' },
] as const satisfies readonly { value: MobileView; label: string }[];

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

  /** Which of the two panes is on screen below `lg`, where they cannot share it. */
  const [mobileView, setMobileView] = useState<MobileView>('chat');

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

  /**
   * Records the assistant's booking state, bringing the panel forward on mobile
   * once it starts asking something of the user.
   *
   * Below `lg` the two panes take turns, so an assistant that has fallen back to
   * the form — or has just confirmed a booking — would otherwise announce it on
   * a pane the user cannot see. From `lg` they sit side by side and the view
   * state is inert.
   */
  const applyBooking = useCallback((next: BookingResult | null) => {
    setBooking(next);

    if (next?.outcome === 'needs_form' || next?.outcome === 'booked') {
      setMobileView('booking');
    }
  }, []);

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
      applyBooking(turn.booking);

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
        applyBooking(update);
      },
    }),
    [applyBooking],
  );

  useSocket(socketHandlers, sessionId);

  // Keep the newest message in view as the conversation grows. `mobileView` is a
  // dependency because hiding the pane zeroes its scroll offset, so coming back
  // from the booking tab would otherwise land at the top of the transcript.
  useEffect(() => {
    const element = transcriptRef.current;
    if (!element) return;

    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [messages, isAssistantTyping, mobileView]);

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
      applyBooking({
        outcome: 'booked',
        missingFields: [],
        reason: null,
        prefill: null,
        appointment,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    },
    [applyBooking, queryClient],
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
    /*
      On phones the grid owns the viewport: it starts below the header and runs
      to the bottom edge, with `-mb-7` cancelling the layout's bottom padding so
      nothing trails underneath. The panes then size themselves from the `1fr`
      row instead of from a hand-counted `calc`, so neither the switcher's height
      nor the page padding has to be duplicated as a magic number here.
    */
    <div className="-mb-7 grid h-[calc(100dvh-5.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 sm:mb-0 sm:h-[calc(100dvh-7rem)] lg:h-auto lg:grid-cols-[minmax(0,1fr)_23rem] lg:grid-rows-none lg:gap-6">
      {/* Below `lg` the two panes take turns instead of stacking. Stacked, the
          booking panel sat under a transcript that scrolls itself, so reaching
          it meant scrolling a page through a scrollable region — and each pane
          got roughly half a screen. Switching gives both the full height. */}
      <div
        className="flex rounded-md border border-ink-15 p-0.5 lg:hidden"
        role="tablist"
        aria-label="Chat views"
      >
        {MOBILE_VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            role="tab"
            aria-selected={mobileView === view.value}
            onClick={() => setMobileView(view.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 text-[0.8125rem] font-medium transition-colors',
              mobileView === view.value ? 'bg-ink text-paper' : 'text-ink-50 hover:text-ink',
            )}
          >
            {view.label}
            {/* Marks the booking pane while it is out of sight, so progress the
                assistant has made is never silently hidden behind a tab. */}
            {view.value === 'booking' && booking && mobileView !== 'booking' ? (
              <span className="size-1.5 rounded-full bg-accent" aria-label="has updates" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Runs edge to edge on phones. Now that the conversation owns the whole
          screen, a card border and the page gutters are just chrome around the
          only thing on it — the negative margin cancels the layout's padding so
          the transcript gets that width back. It becomes a card again at `sm`. */}
      <section
        aria-label="Conversation"
        className={cn(
          'border-ink-15 -mx-5 flex min-h-0 flex-col overflow-hidden border-y',
          'sm:mx-0 sm:rounded-md sm:border-x',
          'lg:h-[calc(100dvh-9rem)] lg:min-h-[30rem]',
          mobileView === 'booking' && 'hidden lg:flex',
        )}
      >
        <header className="border-ink-15 flex items-center gap-3 border-b px-4 py-3.5 sm:px-5">
          <span className="bg-ink text-paper flex size-8 items-center justify-center rounded-md">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-sm font-semibold">Booking assistant</h1>
            <p className="text-ink-50 truncate text-xs">
              {aiEnabled
                ? 'Ask for an appointment in your own words'
                : 'Offline — use the booking form instead'}
            </p>
          </div>
          {/* The dot survives on phones where the word does not: whether the
              assistant is live changes what the user should expect from it. */}
          <span
            className="text-ink-50 flex shrink-0 items-center gap-1.5 text-[0.6875rem]"
            aria-label={aiEnabled ? 'Assistant online' : 'Assistant in fallback mode'}
          >
            <span
              className={cn('size-1.5 rounded-full', aiEnabled ? 'bg-accent' : 'bg-ink-30')}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{aiEnabled ? 'Online' : 'Fallback'}</span>
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
          /* Declaring the x axis is not redundant: `overflow-y: auto` alone
             makes the browser compute `overflow-x` as `auto` too, which turns
             any stray wide child into a sideways scroll. */
          className="scrollbar-slim flex-1 space-y-5 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-5 sm:py-6"
        >
          {transcript.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isEmptyTranscript ? (
            <div className="animate-rise pt-2 sm:pl-10">
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

      {/* Matches the conversation: edge to edge, and scrolling within its own
          pane rather than growing the page, so the booking form is reachable
          without the two panes disagreeing about who owns the scrollbar. */}
      <aside
        aria-label="Booking details"
        className={cn(
          'scrollbar-slim -mx-5 min-h-0 overflow-x-hidden overflow-y-auto sm:mx-0',
          'lg:sticky lg:top-[5.25rem] lg:self-start lg:overflow-x-visible lg:overflow-y-visible',
          mobileView === 'chat' && 'hidden lg:block',
        )}
      >
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
