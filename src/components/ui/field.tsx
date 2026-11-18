import { useId, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
};

/** Campo con etiqueta, ayuda y mensaje de error accesibles. */
export function Field({ label, error, hint, id, className = "", ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-xs font-semibold text-[#4a5366]">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`bg-surface text-ink focus:border-primary focus:ring-primary-soft h-11 w-full rounded-lg border px-3 outline-none focus:ring-3 ${
          error ? "border-danger ring-status-urgent-bg ring-3" : "border-border-strong"
        } ${className}`}
        {...props}
      />
      {hint && (
        <p id={`${inputId}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
