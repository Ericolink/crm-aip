import { ChevronLeft, ChevronRight, ChevronRight as Open, Plus, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { formatDateOnly, formatPhone, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/modules/clients/components/status-badge";
import { listClients } from "@/modules/clients/service";

const PAGE_SIZE = 25;

/**
 * Lista de clientes (Etapa 3: paginación).
 * Búsqueda, filtros combinados, orden y cambio de estatus en la tabla llegan en la Etapa 4.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CLIENT_READ)) return <Forbidden />;

  const t = await getTranslations("Clients");
  const locale = await getLocale();
  const rawPage = Number((await searchParams).page);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const { items, total } = await listClients(user, { page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted mt-0.5">{t("subtitle", { count: total })}</p>
        </div>
        {hasPermission(user, PERMISSIONS.CLIENT_CREATE) && (
          <Link href="/clients/new" className={buttonClasses("primary")}>
            <Plus aria-hidden className="size-4" />
            {t("newClient")}
          </Link>
        )}
      </div>

      {total === 0 ? (
        <div className="border-border-strong bg-surface flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <div className="bg-primary-soft text-primary flex size-11 items-center justify-center rounded-xl">
            <Users aria-hidden className="size-5" />
          </div>
          <p className="font-semibold">{t("empty.title")}</p>
          <p className="text-muted text-sm">{t("empty.body")}</p>
        </div>
      ) : (
        <section className="border-border bg-surface rounded-xl border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-[#4a5366]">
                  {(
                    ["client", "status", "programs", "carrier", "effective", "created"] as const
                  ).map((col) => (
                    <th
                      key={col}
                      scope="col"
                      className="border-border border-b bg-[#f8f9fb] px-3.5 py-2.5"
                    >
                      {t(`columns.${col}`)}
                    </th>
                  ))}
                  <th scope="col" className="border-border border-b bg-[#f8f9fb] px-3.5 py-2.5">
                    <span className="sr-only">{t("columns.open", { name: "" })}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const name = `${c.firstName} ${c.lastName}`;
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-[#f1f3f6] ${c.status === "URGENT" ? "bg-[#fff8f7]" : ""}`}
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
                        <StatusBadge
                          status={c.status}
                          label={t(`status.${c.status}` as "status.NEW")}
                        />
                      </td>
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
                      <td className="text-muted px-3.5 py-3">
                        {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
                          timeZone: "America/New_York",
                          dateStyle: "short",
                        }).format(c.createdAt)}
                      </td>
                      <td className="px-3.5 py-3">
                        <Link
                          href={`/clients/${c.id}`}
                          aria-label={t("columns.open", { name })}
                          className="text-muted inline-flex size-8 items-center justify-center rounded-lg hover:bg-[#f1f3f7]"
                        >
                          <Open aria-hidden className="size-4" />
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
              <PageLink page={page - 1} disabled={page <= 1} label={t("pagination.prev")}>
                <ChevronLeft aria-hidden className="size-4" />
              </PageLink>
              <span className="text-muted flex items-center px-2 text-[13px]">
                {page} / {pages}
              </span>
              <PageLink page={page + 1} disabled={page >= pages} label={t("pagination.next")}>
                <ChevronRight aria-hidden className="size-4" />
              </PageLink>
            </nav>
          </div>
        </section>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  label,
  children,
}: {
  page: number;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "border-border-strong inline-flex size-9 items-center justify-center rounded-lg border bg-surface";
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={`${cls} opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={`/clients?page=${page}`} aria-label={label} className={`${cls} hover:bg-canvas`}>
      {children}
    </Link>
  );
}
