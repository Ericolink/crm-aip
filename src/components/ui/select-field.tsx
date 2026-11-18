import { useId, type SelectHTMLAttributes } from "react";

type Option = { value: string; label: string };

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly Option[];
  error?: string | null;
  /** Texto de la opción vacía (p. ej. "Selecciona…"). Sin él, no hay opción vacía. */
  placeholder?: string;
};

export function SelectField({
  label,
  options,
  error,
  placeholder,
  id,
  className = "",
  ...props
}: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-xs font-semibold text-[#4a5366]">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={`bg-surface text-ink focus:border-primary focus:ring-primary-soft h-11 w-full rounded-lg border px-3 outline-none focus:ring-3 disabled:bg-[#f1f3f6] ${
          error ? "border-danger" : "border-border-strong"
        } ${className}`}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${selectId}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
