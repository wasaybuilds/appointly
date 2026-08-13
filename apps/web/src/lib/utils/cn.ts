import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, resolving Tailwind conflicts in favour of the last value.
 *
 * Lets a component expose a `className` prop that can genuinely override its
 * defaults — `cn('px-4', 'px-6')` yields `px-6` rather than both, which plain
 * string concatenation cannot do.
 *
 * @example
 * <button className={cn('px-4 py-2', variantClasses, className)} />
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
