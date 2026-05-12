import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldProps
>(function Input({ label, hint, error, required, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name ?? Math.random().toString(36).slice(2);
  return (
    <label htmlFor={inputId} className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          'h-11 w-full rounded border border-border bg-surface px-3 text-text outline-none transition-colors',
          'placeholder:text-muted focus:border-primary',
          error && 'border-danger focus:border-danger',
          className,
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} className="mt-1 block text-xs text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-err`} className="mt-1 block text-xs text-danger">
          {error}
        </span>
      )}
    </label>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ label, hint, error, required, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name ?? Math.random().toString(36).slice(2);
  return (
    <label htmlFor={inputId} className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </span>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={3}
        className={cn(
          'w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none transition-colors',
          'placeholder:text-muted focus:border-primary',
          error && 'border-danger focus:border-danger',
          className,
        )}
        aria-invalid={!!error}
        {...rest}
      />
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
});
