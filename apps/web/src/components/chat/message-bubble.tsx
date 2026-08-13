import type { ChatMessage } from '@appointly/shared';
import { cn } from '@/lib/utils/cn';
import { formatRelative } from '@/lib/utils/format';

/** `whitespace-pre-wrap` preserves the confirmation lines the server appends to assistant replies. */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (message.role === 'system') {
    return (
      <div className="animate-rise py-1 text-center">
        <span className="text-xs text-ink-50">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex animate-rise gap-3', isUser && 'flex-row-reverse')}>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold',
          isUser ? 'border border-ink-15 text-ink-50' : 'bg-ink text-paper',
        )}
      >
        {isUser ? 'YOU' : 'A'}
      </span>

      <div className={cn('flex max-w-[78%] flex-col gap-1', isUser && 'items-end')}>
        {/* `break-words` matters more than it looks: max-width cannot break an
            unbroken token, so a long URL or address would push past the bubble
            and turn the transcript into a sideways scroller. */}
        <div
          className={cn(
            'rounded-md px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap',
            isUser ? 'bg-ink text-paper' : 'border border-ink-15 bg-ink-04 text-ink',
          )}
        >
          {message.content}
        </div>

        <time dateTime={message.createdAt} className="px-0.5 text-[0.6875rem] text-ink-50">
          {formatRelative(message.createdAt)}
        </time>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex animate-rise gap-3" aria-live="polite" aria-label="Assistant is typing">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[0.625rem] font-semibold text-paper"
      >
        A
      </span>
      <div className="flex items-center gap-1.5 rounded-md border border-ink-15 bg-ink-04 px-4 py-3.5">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-dot rounded-full bg-ink"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
