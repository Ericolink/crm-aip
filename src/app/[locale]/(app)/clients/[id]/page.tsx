import { ChevronLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { ageFrom, formatDateOnly, formatPhone, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { clientEditScope } from "@/modules/clients/access";
import { DeleteClientButton } from "@/modules/clients/components/delete-client-button";
import { RevealNumber } from "@/modules/clients/components/reveal-number";
import { StatusBadge } from "@/modules/clients/components/status-badge";
import { getClientDetail } from "@/modules/clients/service";

/**
 * Vista del cliente (Etapa 3). En la Etapa 5 se convierte en el perfil completo con
 * las 6 pestañas (Resumen, Aseguranzas, Médicos, Medicamentos, Notas, Actividad).
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientDetail(user, id);
  if (!client) notFound();

  const t = await getTranslations("Clients");
  const locale = (await getLocale()) as "es" | "en";
  const name = `${client.firstName} ${client.lastName}`;
  const age = ageFrom(client.dateOfBirth);
  const canReveal = hasPermission(user, PERMISSIONS.SENSITIVE_REVEAL);
  const dash = t("detail.notProvided");
  const address = (a: typeof client.home) =>
    [a.street, a.unit, [a.city, a.state].filter(Boolean).join(", "), a.zip]
      .filter(Boolean)
      .join(" · ") || dash;
  const dateTime = (d: Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/clients"
        className="text-primary inline-flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("detail.back")}
      </Link>

      <section className="border-border bg-surface flex flex-wrap items-center gap-4 rounded-xl border p-5">
        <div
          className={`flex size-14 items-center justify-center rounded-full text-lg font-bold ${
            client.status === "URGENT"
              ? "bg-status-urgent-bg text-status-urgent-fg"
              : "bg-status-new-bg text-status-new-fg"
          }`}
        >
          {initials(client.firstName, client.lastName)}
        </div>
        <div className="min-w-0 flex-[1_1_280px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-bold">{name}</h1>
            <StatusBadge status={client.status} label={t(`status.${client.status}`)} />
            <span className="border-border-strong rounded-md border bg-[#f8f9fb] px-2 py-0.5 text-xs font-medium">
              {t(`language.${client.preferredLanguage}`)}
            </span>
          </div>
          <p className="text-muted mt-1 text-[13px]">
            {[
              age !== null ? t("detail.age", { age }) : null,
              t("detail.clientSince", { date: dateTime(client.createdAt) }),
              client.assignedAgent
                ? t("detail.agent", { name: client.assignedAgent.name })
                : t("detail.noAgent"),
              t("detail.updated", { date: dateTime(client.updatedAt) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {clientEditScope(user) !== "none" && (
            <Link href={`/clients/${client.id}/edit`} className={buttonClasses("primary", "sm")}>
              <Pencil aria-hidden className="size-4" />
              {t("detail.edit")}
            </Link>
          )}
          {hasPermission(user, PERMISSIONS.CLIENT_DELETE) && (
            <DeleteClientButton clientId={client.id} clientName={name} />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-5">
          <Card title={t("detail.personal")}>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Item label={t("form.dob")}>
                {client.dateOfBirth
                  ? `${formatDateOnly(client.dateOfBirth, locale)}${age !== null ? ` · ${age}` : ""}`
                  : dash}
              </Item>
              <Item label={t("form.email")}>{client.email ?? dash}</Item>
              <Item label={t("detail.phone")}>{formatPhone(client.primaryPhone) || dash}</Item>
              <Item label={t("detail.altContact")}>
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
              </Item>
              <Item label={t("detail.home")}>{address(client.home)}</Item>
              <Item label={t("detail.mailing")}>
                {client.mailingSameAsHome ? t("detail.sameAsHome") : address(client.mailing)}
              </Item>
            </dl>
          </Card>

          <Card title={t("detail.programsTitle")}>
            {client.programs.length === 0 ? (
              <p className="text-muted text-sm">{t("detail.noPrograms")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {client.programs.map((p) => (
                  <li key={p.enrollmentId} className="border-border rounded-lg border p-3.5">
                    <div className="font-semibold">{p.name[locale]}</div>
                    <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                      {p.code !== "ACA" && (
                        <Item label={t("detail.beneficiaryNumber")}>
                          {p.beneficiaryLast4 ? (
                            <RevealNumber
                              enrollmentId={p.enrollmentId}
                              last4={p.beneficiaryLast4}
                              canReveal={canReveal}
                            />
                          ) : (
                            <span className="text-muted">{t("detail.noNumber")}</span>
                          )}
                        </Item>
                      )}
                      {p.code === "MEDICARE" && (
                        <>
                          <Item label={t("form.partA")}>
                            {formatDateOnly(p.partAEffectiveDate, locale) || dash}
                          </Item>
                          <Item label={t("form.partB")}>
                            {formatDateOnly(p.partBEffectiveDate, locale) || dash}
                          </Item>
                        </>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-5">
          <Card title={t("detail.coverage")}>
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
                      {t(`detail.insuranceStatus.${i.status}` as "detail.insuranceStatus.ACTIVE")}
                      {i.effectiveDate ? ` · ${formatDateOnly(i.effectiveDate, locale)}` : ""}
                      {i.memberLast4 ? ` · ${t("detail.member")} •••• ${i.memberLast4}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t("detail.pcp")}>
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
          <p className="text-muted text-xs">{t("detail.moreSoon")}</p>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border bg-surface rounded-xl border">
      <h2 className="border-b border-[#edf0f4] px-5 py-4 text-[15px] font-semibold">{title}</h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted mb-0.5 text-xs font-medium">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
