"use client";

import type { ReactNode } from "react";

/** Piezas visuales compartidas por las pantallas de catálogos (mismo estilo que aseguradoras). */

export function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
        active ? "bg-status-active-bg text-status-active-fg" : "bg-[#eef0f4] text-[#3a4356]"
      }`}
    >
      {label}
    </span>
  );
}

export function CatalogTable({
  headers,
  minWidth,
  children,
}: {
  headers: { key: string; label: string; srOnly?: boolean }[];
  minWidth: number;
  children: ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-xl border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          <thead>
            <tr className="text-left text-xs font-semibold text-[#4a5366]">
              {headers.map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  className="border-border border-b bg-[#f8f9fb] px-4 py-2.5"
                >
                  {h.srOnly ? <span className="sr-only">{h.label}</span> : h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
