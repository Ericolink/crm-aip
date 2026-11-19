"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  CLIENT_SORTS,
  clientListQuery,
  hasActiveFilters,
  type ClientListParams,
} from "../list-params";
import { CLIENT_STATUSES } from "../schema";

type Options = {
  seesInsurance: boolean;
  seesMedical: boolean;
  programs: { code: string; nameEs: string; nameEn: string }[];
  carriers: { id: string; name: string }[];
  conditions: { id: string; nameEs: string; nameEn: string }[];
  agents: { id: string; name: string }[];
};

const selectCls =
  "border-border-strong bg-surface h-10 rounded-lg border px-2.5 text-[13px] font-medium text-ink";

export function ClientFilters({
  params,
  options,
  statusCounts,
  canSearchIdentifiers,
}: {
  params: ClientListParams;
  options: Options;
  statusCounts: Record<string, number>;
  canSearchIdentifiers: boolean;
}) {
  const t = useTranslations("Clients");
  const tf = useTranslations("Clients.filters");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const [showMore, setShowMore] = useState(
    Boolean(params.createdFrom || params.createdTo || params.effectiveFrom || params.effectiveTo),
  );
  const debounce = useRef<number | undefined>(undefined);
  // Último texto que ESTE campo envió a la URL. Si la URL cambia por otra vía
  // (p. ej. el buscador global), el campo se actualiza; si es nuestro eco, no.
  const [sentQ, setSentQ] = useState(params.q);
  const [seenQ, setSeenQ] = useState(params.q);
  if (params.q !== seenQ) {
    setSeenQ(params.q);
    if (params.q !== sentQ) setQ(params.q ?? "");
  }

  function go(overrides: Partial<ClientListParams>) {
    if ("q" in overrides) setSentQ(overrides.q);
    startTransition(() => router.replace(`${pathname}${clientListQuery(params, overrides)}`));
  }

  // Búsqueda mientras se escribe (con pausa de 350 ms para no consultar en cada tecla).
  useEffect(() => () => window.clearTimeout(debounce.current), []);
  function onSearchChange(value: string) {
    setQ(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => go({ q: value.trim() || undefined }), 350);
  }

  const name = (o: { nameEs: string; nameEn: string }) => (locale === "en" ? o.nameEn : o.nameEs);
  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const chips: { label: string; clear: Partial<ClientListParams> }[] = [];
  if (params.q) chips.push({ label: tf("searchChip", { q: params.q }), clear: { q: undefined } });
  for (const s of params.statuses) {
    chips.push({
      label: t(`status.${s}`),
      clear: { statuses: params.statuses.filter((x) => x !== s) },
    });
  }
  const program = options.programs.find((p) => p.code === params.program);
  if (program)
    chips.push({ label: `${tf("program")}: ${name(program)}`, clear: { program: undefined } });
  const carrier = options.carriers.find((c) => c.id === params.carrierId);
  if (carrier)
    chips.push({ label: `${tf("carrier")}: ${carrier.name}`, clear: { carrierId: undefined } });
  const agent = options.agents.find((a) => a.id === params.agentId);
  if (agent) chips.push({ label: `${tf("agent")}: ${agent.name}`, clear: { agentId: undefined } });
  const condition = options.conditions.find((c) => c.id === params.conditionId);
  if (condition)
    chips.push({
      label: `${tf("condition")}: ${name(condition)}`,
      clear: { conditionId: undefined },
    });
  for (const key of ["createdFrom", "createdTo", "effectiveFrom", "effectiveTo"] as const) {
    if (params[key])
      chips.push({ label: `${tf(key)}: ${params[key]}`, clear: { [key]: undefined } });
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      {/* Estatus */}
      <div role="group" aria-label={tf("statusGroup")} className="flex flex-wrap gap-2">
        {[{ key: "ALL" as const }, ...CLIENT_STATUSES.map((s) => ({ key: s }))].map(({ key }) => {
          const selected =
            key === "ALL" ? params.statuses.length === 0 : params.statuses.includes(key);
          const count = key === "ALL" ? allCount : (statusCounts[key] ?? 0);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                go({
                  statuses:
                    key === "ALL"
                      ? []
                      : selected
                        ? params.statuses.filter((s) => s !== key)
                        : [...params.statuses, key],
                })
              }
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium ${
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-border-strong bg-surface hover:bg-canvas text-[#333c4e]"
              }`}
            >
              {key === "ALL" ? tf("all") : t(`status.${key}`)}
              <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Búsqueda, filtros y orden */}
      <div className="border-border bg-surface flex flex-col gap-3 rounded-xl border p-3.5">
        <div className="flex flex-wrap gap-2.5">
          <label className="relative flex min-w-0 flex-[1_1_280px] items-center">
            <span className="sr-only">{tf("searchLabel")}</span>
            <Search aria-hidden className="text-muted absolute left-3 size-4" />
            <input
              type="search"
              value={q}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                canSearchIdentifiers ? tf("searchPlaceholderIds") : tf("searchPlaceholder")
              }
              autoComplete="off"
              spellCheck={false}
              className="border-border-strong focus:border-primary focus:ring-primary-soft h-10 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus:ring-3"
            />
          </label>
          {options.programs.length > 0 && (
            <select
              aria-label={tf("program")}
              value={params.program ?? ""}
              onChange={(e) =>
                go({ program: (e.target.value || undefined) as ClientListParams["program"] })
              }
              className={selectCls}
            >
              <option value="">
                {tf("program")}: {tf("any")}
              </option>
              {options.programs.map((p) => (
                <option key={p.code} value={p.code}>
                  {name(p)}
                </option>
              ))}
            </select>
          )}
          {options.carriers.length > 0 && (
            <select
              aria-label={tf("carrier")}
              value={params.carrierId ?? ""}
              onChange={(e) => go({ carrierId: e.target.value || undefined })}
              className={selectCls}
            >
              <option value="">
                {tf("carrier")}: {tf("any")}
              </option>
              {options.carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {options.agents.length > 0 && (
            <select
              aria-label={tf("agent")}
              value={params.agentId ?? ""}
              onChange={(e) => go({ agentId: e.target.value || undefined })}
              className={selectCls}
            >
              <option value="">
                {tf("agent")}: {tf("any")}
              </option>
              {options.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {options.conditions.length > 0 && (
            <select
              aria-label={tf("condition")}
              value={params.conditionId ?? ""}
              onChange={(e) => go({ conditionId: e.target.value || undefined })}
              className={selectCls}
            >
              <option value="">
                {tf("condition")}: {tf("any")}
              </option>
              {options.conditions.map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setShowMore((v) => !v)}
            className="border-border-strong hover:bg-canvas inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] font-medium"
          >
            <SlidersHorizontal aria-hidden className="size-4" />
            {showMore ? tf("less") : tf("more")}
          </button>
          <label className="ml-auto flex items-center gap-2 text-[13px]">
            <span className="text-muted">{tf("sort")}</span>
            <select
              value={params.sort}
              onChange={(e) => go({ sort: e.target.value as ClientListParams["sort"] })}
              className={selectCls}
            >
              {CLIENT_SORTS.filter((s) => options.seesInsurance || !s.startsWith("effective")).map(
                (s) => (
                  <option key={s} value={s}>
                    {tf(`sorts.${s}`)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>

        {showMore && (
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {(options.seesInsurance
              ? (["createdFrom", "createdTo", "effectiveFrom", "effectiveTo"] as const)
              : (["createdFrom", "createdTo"] as const)
            ).map((key) => (
              <label key={key} className="flex flex-col gap-1 text-xs font-semibold text-[#4a5366]">
                {tf(key)}
                <input
                  type="date"
                  value={params[key] ?? ""}
                  onChange={(e) => go({ [key]: e.target.value || undefined })}
                  className="border-border-strong text-ink h-10 rounded-lg border px-2.5 text-sm font-normal"
                />
              </label>
            ))}
          </div>
        )}

        {canSearchIdentifiers && params.q && (
          <p className="text-muted text-xs">{tf("identifierNote")}</p>
        )}

        {hasActiveFilters(params) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[#edf0f4] pt-3">
            <span className="text-muted text-xs">{tf("active")}</span>
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                aria-label={tf("remove", { label: chip.label })}
                onClick={() => {
                  if ("q" in chip.clear) setQ("");
                  go(chip.clear);
                }}
                className="bg-primary-soft text-primary-dark inline-flex h-7 cursor-pointer items-center gap-1 rounded-full pr-1.5 pl-2.5 text-xs font-medium hover:bg-[#e2e9f9]"
              >
                {chip.label}
                <X aria-hidden className="size-3.5" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setQ("");
                startTransition(() =>
                  router.replace(
                    params.sort !== "created_desc" ? `${pathname}?sort=${params.sort}` : pathname,
                  ),
                );
              }}
              className="text-primary ml-1 cursor-pointer text-xs font-semibold hover:underline"
            >
              {tf("clear")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
