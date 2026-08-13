'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown } from 'lucide-react';
import PhoneInput from 'react-phone-number-input';
import type { Country } from 'react-phone-number-input';
import { cn } from '@/lib/utils/cn';

/*
  Each control owns its id and wires htmlFor, aria-invalid and aria-describedby,
  so an error message is always associated with its input for screen readers.
*/

interface FieldShellProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

function FieldShell({ label, htmlFor, error, hint, required, children }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[0.8125rem] font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-ink-30">*</span> : null}
      </label>

      {children}

      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-50">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-md border bg-paper px-3 text-sm text-ink transition-colors ' +
  'disabled:bg-ink-04 disabled:text-ink-50';

function borderFor(hasError: boolean): string {
  return hasError ? 'border-alert focus:border-alert' : 'border-ink-30 focus:border-ink';
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
  /** Control rendered inside the input's right edge, such as a password toggle. */
  trailing?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, trailing, className, required, ...props },
  ref,
) {
  const id = useId();

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {/* Trailing controls are centred against the input itself, not the whole
          field, so a wrapped label or a hint cannot shift them off-centre. */}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            CONTROL,
            borderFor(Boolean(error)),
            'h-10 outline-none',
            trailing && 'pr-10',
            className,
          )}
          {...props}
        />

        {trailing ? (
          <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
            {trailing}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
});

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, className, required, children, ...props },
  ref,
) {
  const id = useId();

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            CONTROL,
            borderFor(Boolean(error)),
            'h-10 appearance-none pr-9 outline-none',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-50"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  );
});

interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ label, error, hint, className, required, ...props }, ref) {
    const id = useId();

    return (
      <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
        <textarea
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            CONTROL,
            borderFor(Boolean(error)),
            'min-h-20 resize-y py-2 outline-none',
            className,
          )}
          {...props}
        />
      </FieldShell>
    );
  },
);

interface PhoneFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  defaultCountry?: Country;
}

/**
 * Phone entry with a country selector.
 *
 * `react-phone-number-input` supplies the country list, dial codes and
 * as-you-type formatting, and emits a single E.164 string. Storing one
 * normalised value stops the country code and national number drifting apart.
 */
export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  placeholder = 'Phone number',
  defaultCountry = 'GB',
}: PhoneFieldProps) {
  const id = useId();

  return (
    <FieldShell label={label} htmlFor={id} error={error} hint={hint} required={required}>
      <PhoneInput
        id={id}
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(error && 'PhoneInput--error')}
      />
    </FieldShell>
  );
}
