import { getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { NewReminderButton, ReminderList } from "@/modules/reminders/components/reminders";
import { listReminders, REMINDER_VIEWS, type ReminderView } from "@/modules/reminders/service";

/** Página de recordatorios: pendientes, vencidos, completados y cancelados. */
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.REMINDER_MANAGE)) return <Forbidden />;
  const sp = await searchParams;
  const view = (REMINDER_VIEWS as readonly string[]).includes(String(sp.view))
    ? (sp.view as ReminderView)
    : "pending";
  const mine = sp.scope !== "all";
  const data = await listReminders(user, { view, mine });
  const t = await getTranslations("Reminders");
  const me = { id: user.id, name: user.name };
  const href = (v: ReminderView, m: boolean) => `/reminders?view=${v}${m ? "" : "&scope=all"}`;
  const pill = (active: boolean) =>
    `inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium ${
      active
        ? "border-ink bg-ink text-white"
        : "border-border-strong bg-surface text-[#333c4e] hover:bg-canvas"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted mt-0.5">{t("subtitle")}</p>
        </div>
        <NewReminderButton currentUser={me} now={data.now} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("title")} className="flex flex-wrap gap-2">
          {REMINDER_VIEWS.map((v) => (
            <Link
              key={v}
              href={href(v, mine)}
              aria-current={view === v ? "page" : undefined}
              className={pill(view === v)}
            >
              {t(`views.${v}`)}
              <span
                className={
                  v === "overdue" && data.counts.overdue > 0 && view !== v
                    ? "text-danger font-bold"
                    : "opacity-70"
                }
              >
                {data.counts[v]}
              </span>
            </Link>
          ))}
        </nav>
        <nav
          aria-label={t("scope.label")}
          className="border-border-strong bg-surface flex gap-1 rounded-lg border p-[3px]"
        >
          {[true, false].map((m) => (
            <Link
              key={String(m)}
              href={href(view, m)}
              aria-current={mine === m ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mine === m ? "bg-primary text-white" : "text-muted hover:bg-canvas"}`}
            >
              {m ? t("scope.mine") : t("scope.all")}
            </Link>
          ))}
        </nav>
      </div>

      <section className="border-border bg-surface rounded-xl border">
        <ReminderList
          reminders={data.reminders}
          showClient
          currentUser={me}
          now={data.now}
          emptyText={t(`empty.${view}`)}
        />
      </section>
    </div>
  );
}
