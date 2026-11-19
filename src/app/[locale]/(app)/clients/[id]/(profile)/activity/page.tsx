import { History } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { formatDateOnly, formatPhone, parseDateOnly } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import {
  ACTIVITY_CATEGORIES,
  listClientActivity,
  type ActivityCategory,
} from "@/modules/activity/service";

/** Campos cuyo valor es un código que se traduce, según el tipo de registro. */
const ENUM_NAMESPACES: Record<string, Record<string, string>> = {
  client: {
    status: "Clients.status",
    preferredLanguage: "Clients.language",
    altContactRelationship: "Clients.relationship",
  },
  insurance: { status: "Insurance.statuses", program: "Clients.programs" },
  enrollment: { program: "Clients.programs" },
  doctor: { role: "Doctors.roles" },
  medication: { form: "Medications.forms" },
};

/** Pestaña "Actividad": historial de cambios (solo lectura), filtrado por permisos. */
export default async function ClientActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const category = (ACTIVITY_CATEGORIES as readonly string[]).includes(String(sp.category))
    ? (sp.category as ActivityCategory)
    : undefined;
  const before = typeof sp.before === "string" ? sp.before : undefined;
  const data = await listClientActivity(user, id, { category, before });
  if (!data) notFound();

  const t = await getTranslations("Activity");
  const tAll = await getTranslations();
  const locale = await getLocale();
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const base = `/clients/${id}/activity`;

  const fieldLabel = (field: string) =>
    t.has(`fields.${field}`) ? t(`fields.${field}` as "fields.status") : field;

  const valueLabel = (entityType: string, field: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return t("none");
    if (typeof value === "boolean") return value ? t("yes") : t("no");
    if (field === "assignedAgentId" && typeof value === "string")
      return data.agentNames[value] ?? t("none");
    const ns = ENUM_NAMESPACES[entityType]?.[field];
    if (ns && typeof value === "string" && tAll.has(`${ns}.${value}`))
      return tAll(`${ns}.${value}` as "Clients.status.NEW");
    if (typeof value === "string" && parseDateOnly(value))
      return formatDateOnly(parseDateOnly(value), locale);
    if (
      (field === "primaryPhone" || field === "altPhone" || field === "phone") &&
      typeof value === "string"
    ) {
      return formatPhone(value);
    }
    return String(value);
  };

  const pill = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${
      active
        ? "border-ink bg-ink text-white"
        : "border-border-strong bg-surface text-[#333c4e] hover:bg-canvas"
    }`;

  return (
    <section className="border-border bg-surface rounded-xl border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{t("title")}</h2>
          <p className="text-muted text-xs">{t("note")}</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label={t("title")}>
          <Link
            href={base}
            className={pill(!category)}
            aria-current={!category ? "page" : undefined}
          >
            {t("categories.all")}
          </Link>
          {data.categories.map((c) => (
            <Link
              key={c}
              href={`${base}?category=${c}`}
              className={pill(category === c)}
              aria-current={category === c ? "page" : undefined}
            >
              {t(`categories.${c}`)}
            </Link>
          ))}
        </nav>
      </div>

      {data.entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <History aria-hidden className="text-muted size-6" />
          <p className="text-muted text-sm">{t("empty")}</p>
        </div>
      ) : (
        <ol>
          {data.entries.map((e, i) => (
            <li key={e.id} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <span aria-hidden className="bg-primary mt-1.5 size-2.5 shrink-0 rounded-full" />
                {i < data.entries.length - 1 && (
                  <span aria-hidden className="w-0.5 flex-1 bg-[#e3e6ec]" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-4 text-sm">
                <p>
                  <span className="font-semibold">{e.actorName ?? t("system")}</span>{" "}
                  {t(`actions.${e.action}` as "actions.CREATE")}{" "}
                  {t.has(`entities.${e.entityType}`)
                    ? t(`entities.${e.entityType}` as "entities.client")
                    : e.entityType}
                  <time className="text-muted ml-2 text-xs" dateTime={e.createdAt.toISOString()}>
                    {dateTime.format(e.createdAt)}
                  </time>
                </p>
                {e.changes && Object.keys(e.changes).length > 0 && (
                  <dl className="mt-1.5 flex flex-col gap-1 rounded-lg bg-[#f8f9fb] px-3 py-2 text-[13px]">
                    {Object.entries(e.changes).map(([field, change]) => (
                      <div key={field} className="flex flex-wrap gap-x-2">
                        <dt className="text-muted font-medium">{fieldLabel(field)}:</dt>
                        <dd className="min-w-0 break-words">
                          {"changed" in change && change.changed ? (
                            <span className="italic">{t("hidden")}</span>
                          ) : field === "body" ? (
                            <span className="whitespace-pre-wrap">
                              {change.from != null && (
                                <s className="text-muted">{String(change.from)}</s>
                              )}
                              {change.from != null && change.to != null && " → "}
                              {change.to != null && String(change.to)}
                            </span>
                          ) : (
                            <>
                              {change.from != null && (
                                <>
                                  <s className="text-muted">
                                    {valueLabel(e.entityType, field, change.from)}
                                  </s>{" "}
                                  →{" "}
                                </>
                              )}
                              <span className="font-medium">
                                {valueLabel(e.entityType, field, change.to)}
                              </span>
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-[13px] font-medium">
        {before && (
          <Link
            href={category ? `${base}?category=${category}` : base}
            className="text-primary hover:underline"
          >
            {t("newest")}
          </Link>
        )}
        {data.nextCursor && (
          <Link
            href={`${base}?${new URLSearchParams({ ...(category ? { category } : {}), before: data.nextCursor })}`}
            className="text-primary hover:underline"
          >
            {t("older")}
          </Link>
        )}
      </div>
    </section>
  );
}
