import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, DetailItem } from "@/components/ui/card";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ageFrom, formatDateOnly, formatPhone } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { getClientDetailForRequest } from "@/modules/clients/queries";
import { latestImportantNote } from "@/modules/notes/service";
import { NewReminderButton, ReminderList } from "@/modules/reminders/components/reminders";
import { listReminders } from "@/modules/reminders/service";

/** Pestaña "Resumen": datos personales y, según el rol, cobertura actual, PCP y condiciones. */
export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientDetailForRequest(user, id);
  if (!client) notFound();

  const t = await getTranslations("Clients");
  const ti = await getTranslations("Insurance");
  const tp = await getTranslations("Profile");
  const tn = await getTranslations("Notes");
  const importantNote = await latestImportantNote(user, client.id);
  const tr = await getTranslations("Reminders");
  const reminders = hasPermission(user, PERMISSIONS.REMINDER_MANAGE)
    ? await listReminders(user, { view: "pending", clientId: client.id, limit: 5 })
    : null;
  const me = { id: user.id, name: user.name };
  const noteDate = (d: Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  const locale = (await getLocale()) as "es" | "en";
  const age = ageFrom(client.dateOfBirth);
  const dash = t("detail.notProvided");
  const address = (a: typeof client.home) =>
    [a.street, a.unit, [a.city, a.state].filter(Boolean).join(", "), a.zip]
      .filter(Boolean)
      .join(" · ") || dash;

  return (
    <div className="flex flex-wrap items-start gap-5">
      <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
        <Card title={t("detail.personal")}>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailItem label={t("form.dob")}>
              {client.dateOfBirth
                ? `${formatDateOnly(client.dateOfBirth, locale)}${age !== null ? ` · ${age}` : ""}`
                : dash}
            </DetailItem>
            <DetailItem label={t("form.email")}>{client.email ?? dash}</DetailItem>
            <DetailItem label={t("detail.phone")}>
              {formatPhone(client.primaryPhone) || dash}
            </DetailItem>
            <DetailItem label={t("detail.altContact")}>
              {client.altPhone || client.altContactName
                ? [
                    formatPhone(client.altPhone),
                    client.altContactName,
                    client.altContactRelationship === "OTHER"
                      ? client.altContactRelationshipOther
                      : client.altContactRelationship
                        ? t(`relationship.${client.altContactRelationship}`)
                        : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : dash}
            </DetailItem>
            <DetailItem label={t("detail.home")}>{address(client.home)}</DetailItem>
            <DetailItem label={t("detail.mailing")}>
              {client.mailingSameAsHome ? t("detail.sameAsHome") : address(client.mailing)}
            </DetailItem>
          </dl>
        </Card>
      </div>

      <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
        {reminders && (
          <section className="border-border bg-surface rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf0f4] px-5 py-3">
              <h2 className="text-[15px] font-semibold">
                {tr("clientTitle")}
                {reminders.counts.pending > 0 && (
                  <span className="text-muted ml-1.5 text-sm font-normal">
                    ({reminders.counts.pending})
                  </span>
                )}
              </h2>
              <NewReminderButton
                clientId={client.id}
                currentUser={me}
                now={reminders.now}
                size="sm"
              />
            </div>
            <ReminderList
              reminders={reminders.reminders}
              showClient={false}
              currentUser={me}
              now={reminders.now}
              emptyText={tr("empty.pending")}
            />
          </section>
        )}
        <Card
          title={tn("latestImportant")}
          action={
            <Link
              href={`/clients/${client.id}/notes`}
              className="text-primary text-[13px] font-medium hover:underline"
            >
              {tn("seeAll")}
            </Link>
          }
        >
          {importantNote ? (
            <div className="rounded-lg border border-[#f3d9a4] bg-[#fffaf0] p-3 text-sm">
              <p className="text-muted mb-1 text-xs">
                {importantNote.author.name} · {noteDate(importantNote.createdAt)}
              </p>
              <p className="line-clamp-4 break-words whitespace-pre-wrap">{importantNote.body}</p>
            </div>
          ) : (
            <p className="text-muted text-sm">{tn("noImportant")}</p>
          )}
        </Card>
        {client.access.insurance && (
          <Card
            title={t("detail.coverage")}
            action={
              <Link
                href={`/clients/${client.id}/insurance`}
                className="text-primary text-[13px] font-medium hover:underline"
              >
                {ti("historyTitle")}
              </Link>
            }
          >
            {client.currentInsurances.length === 0 ? (
              <p className="text-muted text-sm">{t("detail.noCoverage")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {client.currentInsurances.map((i) => (
                  <li key={i.id} className="text-sm">
                    <div className="font-semibold">
                      {i.carrier} · {t(`programs.${i.programCode}` as "programs.ACA")}
                    </div>
                    <div className="text-muted">
                      {ti(`statuses.${i.status}` as "statuses.ACTIVE")}
                      {i.effectiveDate ? ` · ${formatDateOnly(i.effectiveDate, locale)}` : ""}
                      {i.memberLast4 ? ` · ${t("detail.member")} •••• ${i.memberLast4}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {client.access.medical && (
          <>
            <Card
              title={t("detail.pcp")}
              action={
                <Link
                  href={`/clients/${client.id}/doctors`}
                  className="text-primary text-[13px] font-medium hover:underline"
                >
                  {tp("tabs.doctors")}
                </Link>
              }
            >
              {client.pcp ? (
                <p className="text-sm">
                  <span className="font-semibold">{client.pcp.name}</span>
                  {client.pcp.phone ? (
                    <span className="text-muted"> · {formatPhone(client.pcp.phone)}</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-muted text-sm">{t("detail.noPcp")}</p>
              )}
            </Card>
            <Card title={t("detail.conditions")}>
              {client.conditions.length === 0 ? (
                <p className="text-muted text-sm">{t("detail.noConditions")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {client.conditions.map((c) => (
                    <span
                      key={c.id}
                      className="border-border-strong rounded-md border bg-[#f8f9fb] px-2.5 py-1 text-xs font-medium"
                    >
                      {c.name[locale]}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
