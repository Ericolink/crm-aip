import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { AUDIT_ACTIONS } from "@/lib/audit/sanitize";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { AUDIT_OUTCOMES, listAuditLog, parseAuditFilters } from "@/modules/audit/service";

const OUTCOME_TONE: Record<string, string> = {
  SUCCESS: "bg-status-active-bg text-status-active-fg",
  FAILURE: "bg-status-pending-bg text-status-pending-fg",
  DENIED: "bg-status-urgent-bg text-status-urgent-fg",
};

const control =
  "bg-surface border-border-strong focus:border-primary focus:ring-primary-soft h-10 rounded-lg border px-2.5 text-sm outline-none focus:ring-3";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.AUDIT_READ)) return <Forbidden />;

  const filters = parseAuditFilters(await searchParams);
  const data = await listAuditLog(user, filters);
  const t = await getTranslations("Settings.audit");
  const locale = await getLocale();
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "medium",
  });
  const actionLabel = (a: string) =>
    t.has(`actions.${a}`) ? t(`actions.${a}` as "actions.LOGOUT") : a;

  // Los mismos filtros, sin el cursor, para "volver a los más recientes" y paginar.
  const query = new URLSearchParams(
    Object.entries({
      from: filters.from,
      to: filters.to,
      action: filters.action,
      outcome: filters.outcome,
      actor: filters.actorId,
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const withQuery = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const s = q.toString();
    return s ? `/settings/audit?${s}` : "/settings/audit";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted mt-1 text-sm">{t("subtitle")}</p>
      </div>

      <form
        method="get"
        aria-label={t("filters.label")}
        className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#4a5366]">
          {t("filters.from")}
          <input type="date" name="from" defaultValue={filters.from} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#4a5366]">
          {t("filters.to")}
          <input type="date" name="to" defaultValue={filters.to} className={control} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-[#4a5366]">
          {t("filters.action")}
          <select name="action" defaultValue={filters.action ?? ""} className={control}>
            <option value="">{t("filters.all")}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#4a5366]">
          {t("filters.outcome")}
          <select name="outcome" defaultValue={filters.outcome ?? ""} className={control}>
            <option value="">{t("filters.all")}</option>
            {AUDIT_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {t(`outcomes.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-[#4a5366]">
          {t("filters.actor")}
          <select name="actor" defaultValue={filters.actorId ?? ""} className={control}>
            <option value="">{t("filters.all")}</option>
            {data.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses("primary")}>
            {t("filters.apply")}
          </button>
          <Link href="/settings/audit" className={buttonClasses("secondary")}>
            {t("filters.clear")}
          </Link>
        </div>
      </form>

      <section className="border-border bg-surface rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-[#4a5366]">
                {(["date", "actor", "action", "outcome", "target", "ip", "details"] as const).map(
                  (c) => (
                    <th
                      key={c}
                      scope="col"
                      className="border-border border-b bg-[#f8f9fb] px-3 py-2.5"
                    >
                      {t(`columns.${c}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted px-3 py-6 text-center">
                    {t("empty")}
                  </td>
                </tr>
              )}
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-[#f1f3f6] align-top">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    <time dateTime={e.createdAt.toISOString()}>{dateTime.format(e.createdAt)}</time>
                  </td>
                  <td className="px-3 py-2">{e.actor?.name ?? t("noActor")}</td>
                  <td className="px-3 py-2 font-medium">{actionLabel(e.action)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
                        OUTCOME_TONE[e.outcome] ?? "bg-[#eef0f4] text-[#3a4356]"
                      }`}
                    >
                      {t.has(`outcomes.${e.outcome}`)
                        ? t(`outcomes.${e.outcome}` as "outcomes.SUCCESS")
                        : e.outcome}
                    </span>
                  </td>
                  <td className="text-muted px-3 py-2 break-all">
                    {e.targetType ? `${e.targetType} · ${e.targetId?.slice(0, 10) ?? ""}` : "—"}
                  </td>
                  <td className="text-muted px-3 py-2 font-mono text-xs">{e.ipAddress ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.metadata ? (
                      <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {Object.entries(e.metadata).map(([k, v]) => (
                          <div key={k} className="flex gap-1">
                            <dt className="text-muted">{k}:</dt>
                            <dd className="break-all">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-4 text-[13px] font-medium">
        {filters.before && (
          <Link href={withQuery()} className="text-primary hover:underline">
            {t("newest")}
          </Link>
        )}
        {data.nextCursor && (
          <Link
            href={withQuery({ before: data.nextCursor })}
            className="text-primary hover:underline"
          >
            {t("older")}
          </Link>
        )}
      </div>
    </div>
  );
}
