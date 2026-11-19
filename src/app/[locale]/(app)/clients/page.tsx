import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, SearchX, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Forbidden } from "@/components/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { formatDateOnly, formatPhone, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { clientEditScope } from "@/modules/clients/access";
import { ClientFilters } from "@/modules/clients/components/client-filters";
import { StatusBadge } from "@/modules/clients/components/status-badge";
import { StatusMenu } from "@/modules/clients/components/status-menu";
import {
  clientListQuery,
  hasActiveFilters,
  PAGE_SIZE,
  parseClientListParams,
  type ClientListParams,
  type ClientSort,
} from "@/modules/clients/list-params";
import { canSearchIdentifiers } from "@/modules/clients/search";
import { getClientListOptions, listClients } from "@/modules/clients/service";

/** Lista de clientes: búsqueda, filtros combinados, orden, paginación y estatus editable. */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CLIENT_READ)) return <Forbidden />;

  const t = await getTranslations("Clients");
  const locale = await getLocale();
  const params = parseClientListParams(await searchParams);
  const [{ items, total, statusCounts }, options] = await Promise.all([
    listClients(user, { ...params, pageSize: PAGE_SIZE }),
    getClientListOptions(user),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (params.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(params.page * PAGE_SIZE, total);
  const canChangeStatus = clientEditScope(user) === "full";
  const showAgent = options.agents.length > 0;
  const showCoverage = options.seesInsurance;
  const filtered = hasActiveFilters(params);
  const createdFmt = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted mt-0.5" aria-live="polite">
            {filtered ? t("filters.results", { count: total }) : t("subtitle", { count: total })}
          </p>
        </div>
        {hasPermission(user, PERMISSIONS.CLIENT_CREATE) && (
          <Link href="/clients/new" className={buttonClasses("primary")}>
            <Plus aria-hidden className="size-4" />
            {t("newClient")}
          </Link>
        )}
      </div>

      <ClientFilters
        params={params}
        options={options}
        statusCounts={statusCounts}
        canSearchIdentifiers={canSearchIdentifiers(user)}
      />

      {total === 0 ? (
        <div className="border-border-strong bg-surface flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
            {filtered ? (
              <SearchX aria-hidden className="size-5" />
            ) : (
              <Users aria-hidden className="size-5" />
            )}
          </div>
          <p className="font-semibold">{filtered ? t("filters.emptyTitle") : t("empty.title")}</p>
          <p className="text-muted text-sm">
            {filtered ? t("filters.emptyBody") : t("empty.body")}
          </p>
          {filtered && (
            <Link href="/clients" className={`${buttonClasses("secondary", "sm")} mt-2`}>
              {t("filters.clear")}
            </Link>
          )}
        </div>
      ) : (
        <section className="border-border bg-surface rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#4a5366]">
                  <SortableTh params={params} label={t("columns.client")} asc="name_asc" />
                  <Th>{t("columns.status")}</Th>
                  {showCoverage && (
                    <>
                      <Th>{t("columns.programs")}</Th>
                      <Th>{t("columns.carrier")}</Th>
                      <SortableTh
                        params={params}
                        label={t("columns.effective")}
                        asc="effective_asc"
                        desc="effective_desc"
                      />
                    </>
                  )}
                  {showAgent && <Th>{t("filters.agentColumn")}</Th>}
                  <SortableTh
                    params={params}
                    label={t("columns.created")}
                    asc="created_asc"
                    desc="created_desc"
                  />
                  <Th>
                    <span className="sr-only">{t("columns.open", { name: "" })}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const name = `${c.firstName} ${c.lastName}`;
                  const status = c.status as "NEW" | "PENDING" | "ACTIVE" | "URGENT";
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-[#f1f3f6] ${status === "URGENT" ? "bg-[#fff8f7]" : ""}`}
                    >
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-xs font-semibold text-[#3a4356]">
                            {initials(c.firstName, c.lastName)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/clients/${c.id}`}
                              className="text-ink font-semibold hover:underline"
                            >
                              {name}
                            </Link>
                            <div className="text-muted flex items-center gap-1.5 text-xs">
                              {formatPhone(c.primaryPhone)}
                              <span className="border-border-strong rounded border px-1 text-[10px] font-medium">
                                {c.preferredLanguage}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        {canChangeStatus ? (
                          <StatusMenu
                            key={`${c.id}-${status}`}
                            clientId={c.id}
                            clientName={name}
                            status={status}
                          />
                        ) : (
                          <StatusBadge status={status} label={t(`status.${status}`)} />
                        )}
                      </td>
                      {showCoverage && (
                        <>
                          <td className="px-3.5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {c.programs.map((p) => (
                                <span
                                  key={p}
                                  className="border-border-strong rounded-md border bg-[#f8f9fb] px-1.5 py-0.5 text-xs font-medium"
                                >
                                  {t(`programs.${p}` as "programs.ACA")}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3.5 py-3">{c.currentCarrier ?? "—"}</td>
                          <td className="px-3.5 py-3">
                            {formatDateOnly(c.effectiveDate, locale) || "—"}
                          </td>
                        </>
                      )}
                      {showAgent && <td className="px-3.5 py-3">{c.assignedAgentName ?? "—"}</td>}
                      <td className="text-muted px-3.5 py-3">{createdFmt.format(c.createdAt)}</td>
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/clients/${c.id}`}
                          aria-label={t("columns.open", { name })}
                          className="text-muted inline-flex size-8 items-center justify-center rounded-lg hover:bg-[#f1f3f7]"
                        >
                          <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-muted text-[13px]">{t("pagination.showing", { from, to, total })}</p>
            <nav aria-label={t("pagination.label")} className="flex gap-1.5">
              <PageLink
                href={clientListQuery(params, { page: params.page - 1 })}
                disabled={params.page <= 1}
                label={t("pagination.prev")}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </PageLink>
              <span className="text-muted flex items-center px-2 text-[13px]">
                {params.page} / {pages}
              </span>
              <PageLink
                href={clientListQuery(params, { page: params.page + 1 })}
                disabled={params.page >= pages}
                label={t("pagination.next")}
              >
                <ChevronRight aria-hidden className="size-4" />
              </PageLink>
            </nav>
          </div>
        </section>
      )}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="border-border border-b bg-[#f8f9fb] px-3.5 py-2.5">
      {children}
    </th>
  );
}

/** Encabezado que ordena al hacer clic; alterna ascendente/descendente si ambos existen. */
async function SortableTh({
  params,
  label,
  asc,
  desc,
}: {
  params: ClientListParams;
  label: string;
  asc: ClientSort;
  desc?: ClientSort;
}) {
  const t = await getTranslations("Clients.filters");
  const active = params.sort === asc || params.sort === desc;
  const next: ClientSort = params.sort === asc && desc ? desc : asc;
  const ariaSort = !active ? "none" : params.sort === asc ? "ascending" : "descending";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="border-border border-b bg-[#f8f9fb] px-3.5 py-2.5"
    >
      <Link
        href={`/clients${clientListQuery(params, { sort: next })}`}
        title={t("sortBy", { column: label })}
        className={`inline-flex items-center gap-1 hover:underline ${active ? "text-primary-dark" : ""}`}
      >
        {label}
        {active &&
          (ariaSort === "ascending" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          ))}
      </Link>
    </th>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  const cls =
    "border-border-strong bg-surface inline-flex size-9 items-center justify-center rounded-lg border";
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={`${cls} opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/clients${href}`} aria-label={label} className={`${cls} hover:bg-canvas`}>
      {children}
    </Link>
  );
}
