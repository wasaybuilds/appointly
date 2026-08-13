'use client';

import { ArrowUp } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_CHAT_MESSAGE_LENGTH } from '@appointly/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

/**
 * Message input.
 *
 * Enter sends and Shift+Enter inserts a newline, matching every chat product a
 * user has already learned. The textarea grows with its content up to a cap so
 * a long message stays readable without pushing the transcript off screen.
 */

interface ChatComposerProps {
  onSend: (content: string) => void;
  isSending: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_TEXTAREA_HEIGHT_PX = 160;

export function ChatComposer({
  onSend,
  isSending,
  disabled = false,
  placeholder = 'Tell the assistant what you need…',
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value.trim();
  const isOverLimit = trimmed.length > MAX_CHAT_MESSAGE_LENGTH;
  const canSend = trimmed.length > 0 && !isOverLimit && !isSending && !disabled;

  const resize = (): void => {
    const element = textareaRef.current;
    if (!element) return;

    // Reset before measuring, otherwise scrollHeight only ever grows.
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  };

  const submit = (): void => {
    if (!canSend) return;

    onSend(trimmed);
    setValue('');

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-ink-15 bg-paper px-4 py-3.5">
      <div
        className={cn(
          'flex items-end gap-2 rounded-md border bg-paper px-3 py-2 transition-colors',
          isOverLimit ? 'border-alert' : 'border-ink-30 focus-within:border-ink',
        )}
      >
        <label htmlFor="chat-composer" className="sr-only">
          Message the assistant
        </label>
        <textarea
          id="chat-composer"
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={isOverLimit || undefined}
          onChange={(event) => {
            setValue(event.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          className="max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink outline-none disabled:cursor-not-allowed"
        />

        <Button
          type="submit"
          size="sm"
          disabled={!canSend}
          isLoading={isSending}
          aria-label="Send message"
          className="mb-0.5 size-9 shrink-0 rounded-md p-0 sm:size-8"
        >
          {isSending ? null : <ArrowUp className="size-4" aria-hidden="true" />}
        </Button>
      </div>

      <div className="mt-2 flex justify-between px-0.5">
        {/* Keyboard guidance is meaningless on a touch keyboard, where Enter
            inserts a newline, and it is the widest thing in this row. */}
        <span className="hidden text-[0.6875rem] text-ink-50 sm:inline">
          Enter to send · Shift + Enter for a new line
        </span>
        {trimmed.length > MAX_CHAT_MESSAGE_LENGTH * 0.8 ? (
          <span
            className={cn('ml-auto text-[0.6875rem]', isOverLimit ? 'text-alert' : 'text-ink-50')}
          >
            {trimmed.length} / {MAX_CHAT_MESSAGE_LENGTH}
          </span>
        ) : null}
      </div>
    </form>
  );
}
