import type { ReactNode } from "react";

/** Tarjeta con título (secciones del perfil). */
export function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f4] px-5 py-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Par etiqueta / valor dentro de un <dl>. */
export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted mb-0.5 text-xs font-medium">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
