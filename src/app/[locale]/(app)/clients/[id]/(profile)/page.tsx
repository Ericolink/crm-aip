import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, DetailItem } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { ageFrom, formatDateOnly, formatPhone } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import { getClientDetailForRequest } from "@/modules/clients/queries";

/** Pestaña "Resumen": datos personales y, según el rol, cobertura actual, PCP y condiciones. */
export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientDetailForRequest(user, id);
  if (!client) notFound();

  const t = await getTranslations("Clients");
  const ti = await getTranslations("Insurance");
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
          </>
        )}
      </div>
    </div>
  );
}
