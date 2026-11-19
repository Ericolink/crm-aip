import { CalendarClock, Phone, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { formatDateOnly, formatPhone, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/modules/clients/components/status-badge";
import { getDashboard } from "@/modules/dashboard/service";

const STATUS_DOT: Record<string, string> = {
  NEW: "bg-status-new-fg",
  PENDING: "bg-warning",
  ACTIVE: "bg-success",
  URGENT: "bg-danger",
};
const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "bg-status-urgent-bg text-status-urgent-fg",
  HIGH: "bg-status-pending-bg text-status-pending-fg",
  NORMAL: "bg-[#eef0f4] text-[#3a4356]",
};

/** Panel principal: indicadores, seguimientos, coberturas y actividad, según el rol. */
export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboard(user);
  const t = await getTranslations("Dashboard");
  const tc = await getTranslations("Clients");
  const ta = await getTranslations("Activity");
  const locale = (await getLocale()) as "es" | "en";
  const intlLocale = locale === "en" ? "en-US" : "es-US";
  const tz = "America/New_York";
  const longDate = new Intl.DateTimeFormat(intlLocale, {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(data.now);
  const timeFmt = new Intl.DateTimeFormat(intlLocale, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat(intlLocale, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const shortDateTime = new Intl.DateTimeFormat(intlLocale, {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const todayKey = dayKey(data.now);
  const tomorrowKey = dayKey(new Date(data.now.getTime() + 86_400_000));
  const when = (d: Date, overdue: boolean) =>
    overdue
      ? t("overdue")
      : dayKey(d) === todayKey
        ? t("today_")
        : dayKey(d) === tomorrowKey
          ? t("tomorrow")
          : dayFmt.format(d);
  const name = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;
  const maxProgram = Math.max(1, ...(data.coverage?.programs.map((p) => p.count) ?? [1]));

  const kpis = [
    {
      key: "total",
      label: t("kpis.total"),
      value: data.total,
      href: "/clients",
      sub: t("kpis.newThisWeek", { count: data.newThisWeek }),
      dot: "bg-[#9aa3b2]",
    },
    ...(["NEW", "PENDING", "ACTIVE", "URGENT"] as const).map((s) => ({
      key: s,
      label: t(`kpis.${s}`),
      value: data.statusCounts[s],
      href: `/clients?status=${s}`,
      sub: s === "URGENT" ? t("kpis.overdue", { count: data.overdueCount }) : null,
      dot: STATUS_DOT[s],
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("greeting", { name: user.name })}</h1>
          <p className="text-muted mt-0.5 first-letter:uppercase">{longDate}</p>
        </div>
        {hasPermission(user, PERMISSIONS.CLIENT_CREATE) && (
          <Link href="/clients/new" className={buttonClasses("primary")}>
            <Plus aria-hidden className="size-4" />
            {t("newClient")}
          </Link>
        )}
      </div>

      {/* Indicadores */}
      <div className="flex flex-wrap gap-4">
        {kpis.map((k) => (
          <Link
            key={k.key}
            href={k.href}
            aria-label={`${t("kpis.viewList", { label: k.label })}: ${k.value}`}
            className="border-border bg-surface hover:border-border-strong flex-[1_1_170px] rounded-xl border px-5 py-4 hover:shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted text-[13px] font-medium">{k.label}</span>
              <span aria-hidden className={`size-2 rounded-full ${k.dot}`} />
            </div>
            <div className="mt-1 text-3xl font-bold tracking-tight">{k.value}</div>
            {k.sub && <div className="text-muted text-xs">{k.sub}</div>}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-5">
        {data.coverage && (
          <Panel className="flex-[1_1_300px]" title={t("byProgram")}>
            <div className="flex flex-col gap-4">
              {data.coverage.programs.map((p) => (
                <div key={p.code}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <Link
                      href={`/clients?program=${p.code}`}
                      className="font-medium hover:underline"
                    >
                      {p.name[locale]}
                    </Link>
                    <span className="font-semibold">{p.count}</span>
                  </div>
                  <div className="h-2 rounded bg-[#eef0f4]" aria-hidden>
                    <div
                      className="bg-primary h-2 rounded"
                      style={{ width: `${Math.round((p.count / maxProgram) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-muted text-xs">{t("byProgramNote")}</p>
            </div>
          </Panel>
        )}

        <Panel className="min-w-0 flex-[2_1_520px]" title={t("followUps")} bodyClass="p-0">
          {data.followUps.length === 0 ? (
            <Empty>{t("noFollowUps")}</Empty>
          ) : (
            <ul>
              {data.followUps.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b border-[#f1f3f6] px-5 py-3 last:border-b-0"
                >
                  <div className="w-24 shrink-0 text-[13px]">
                    <div className={`font-semibold ${r.overdue ? "text-danger" : ""}`}>
                      {when(r.dueAt, r.overdue)}
                    </div>
                    <div className="text-muted text-xs">{timeFmt.format(r.dueAt)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/clients/${r.client.id}`}
                      className="font-semibold hover:underline"
                    >
                      {name(r.client)}
                    </Link>
                    <div className="text-muted truncate text-[13px]">{r.description}</div>
                  </div>
                  <span
                    className={`hidden h-6 items-center rounded-full px-2.5 text-xs font-semibold sm:inline-flex ${PRIORITY_STYLE[r.priority]}`}
                  >
                    {t(`priority.${r.priority}`)}
                  </span>
                  {r.client.primaryPhone && (
                    <a
                      href={`tel:+1${r.client.primaryPhone}`}
                      aria-label={`${formatPhone(r.client.primaryPhone)} · ${name(r.client)}`}
                      className="border-border-strong text-muted hover:bg-canvas inline-flex size-9 shrink-0 items-center justify-center rounded-lg border"
                    >
                      <Phone aria-hidden className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {hasPermission(user, PERMISSIONS.REMINDER_MANAGE) && (
            <Link
              href="/reminders"
              className="text-primary block border-t border-[#edf0f4] px-5 py-2.5 text-[13px] font-semibold hover:underline"
            >
              {t("allReminders")}
            </Link>
          )}
        </Panel>
      </div>

      <div className="flex flex-wrap gap-5">
        {data.coverage && (
          <>
            <Panel className="min-w-0 flex-[1_1_300px]" title={t("effective")} bodyClass="p-0">
              {data.coverage.upcomingEffective.length === 0 ? (
                <Empty>{t("noEffective")}</Empty>
              ) : (
                <ul>
                  {data.coverage.upcomingEffective.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center gap-3 border-b border-[#f1f3f6] px-5 py-3 last:border-b-0"
                    >
                      <div className="border-border flex w-14 shrink-0 flex-col items-center rounded-lg border py-1">
                        <CalendarClock aria-hidden className="text-muted size-3.5" />
                        <span className="text-xs font-semibold">
                          {formatDateOnly(i.effectiveDate, locale)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/clients/${i.client.id}/insurance`}
                          className="font-semibold hover:underline"
                        >
                          {name(i.client)}
                        </Link>
                        <div className="text-muted text-xs">
                          {i.carrier.name} · {tc(`programs.${i.program.code}` as "programs.ACA")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              className="min-w-0 flex-[1_1_300px]"
              title={`${t("pending")} (${data.coverage.pendingApplicationsCount})`}
              bodyClass="p-0"
            >
              {data.coverage.pendingApplications.length === 0 ? (
                <Empty>{t("noPending")}</Empty>
              ) : (
                <ul>
                  {data.coverage.pendingApplications.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center gap-3 border-b border-[#f1f3f6] px-5 py-3 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/clients/${i.client.id}/insurance`}
                          className="font-semibold hover:underline"
                        >
                          {name(i.client)}
                        </Link>
                        <div className="text-muted text-xs">{i.carrier.name}</div>
                      </div>
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
                          (i.daysWaiting ?? 0) > 14
                            ? "bg-status-urgent-bg text-status-urgent-fg"
                            : "bg-status-pending-bg text-status-pending-fg"
                        }`}
                      >
                        {i.daysWaiting === null
                          ? t("submittedUnknown")
                          : t("waiting", { days: i.daysWaiting })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
        <Panel
          className="min-w-0 flex-[1_1_300px]"
          title={t("recent")}
          bodyClass="p-0"
          action={
            <Link href="/clients" className="text-primary text-[13px] font-medium hover:underline">
              {t("seeAll")}
            </Link>
          }
        >
          {data.recentClients.length === 0 ? (
            <Empty>{t("noRecent")}</Empty>
          ) : (
            <ul>
              {data.recentClients.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 border-b border-[#f1f3f6] px-5 py-3 last:border-b-0"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-xs font-semibold text-[#3a4356]">
                    {initials(c.firstName, c.lastName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/clients/${c.id}`} className="font-semibold hover:underline">
                      {name(c)}
                    </Link>
                    <div className="text-muted text-xs">{shortDateTime.format(c.createdAt)}</div>
                  </div>
                  <StatusBadge status={c.status} label={tc(`status.${c.status}`)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t("activity")} bodyClass="p-0">
        {data.activity.length === 0 ? (
          <Empty>{t("noActivity")}</Empty>
        ) : (
          <ul>
            {data.activity.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[#f1f3f6] px-5 py-2.5 text-[13px] last:border-b-0"
              >
                <span
                  aria-hidden
                  className="bg-primary size-2 shrink-0 translate-y-[-1px] rounded-full"
                />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{a.actor?.name ?? ta("system")}</span>{" "}
                  {ta(`actions.${a.action}` as "actions.CREATE")}{" "}
                  {ta.has(`entities.${a.entityType}`)
                    ? ta(`entities.${a.entityType}` as "entities.client")
                    : a.entityType}
                  {a.client && a.entityType !== "client" && (
                    <>
                      {" · "}
                      <Link
                        href={`/clients/${a.client.id}/activity`}
                        className="text-primary font-medium hover:underline"
                      >
                        {name(a.client)}
                      </Link>
                    </>
                  )}
                  {a.client && a.entityType === "client" && (
                    <>
                      {": "}
                      <Link
                        href={`/clients/${a.client.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {name(a.client)}
                      </Link>
                    </>
                  )}
                </span>
                <time className="text-muted text-xs" dateTime={a.createdAt.toISOString()}>
                  {shortDateTime.format(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  action,
  className = "",
  bodyClass = "",
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  bodyClass?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Card title={title} action={action}>
        <div className={bodyClass ? `-mx-5 -my-4 ${bodyClass}` : ""}>{children}</div>
      </Card>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted px-5 py-6 text-center text-sm">{children}</p>;
}
