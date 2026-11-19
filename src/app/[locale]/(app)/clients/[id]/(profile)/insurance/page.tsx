import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { Card, DetailItem } from "@/components/ui/card";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { formatDateOnly } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { RevealNumber } from "@/modules/clients/components/reveal-number";
import {
  AddCoverageButton,
  CoverageActions,
} from "@/modules/insurance/components/coverage-actions";
import { getClientCoverage } from "@/modules/insurance/service";

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-status-active-bg text-status-active-fg",
  APPLICATION_PENDING: "bg-status-pending-bg text-status-pending-fg",
  ENDED: "bg-[#eef0f4] text-[#3a4356]",
  CANCELLED: "bg-[#eef0f4] text-[#3a4356]",
  DENIED: "bg-status-urgent-bg text-status-urgent-fg",
};

/** Pestaña "Aseguranzas": programas del beneficiario, coberturas actuales e historial. */
export default async function ClientInsurancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.INSURANCE_READ)) return <Forbidden />;
  const { id } = await params;
  const data = await getClientCoverage(user, id);
  if (!data) notFound();

  const t = await getTranslations("Insurance");
  const tc = await getTranslations("Clients");
  const locale = (await getLocale()) as "es" | "en";
  const dash = "—";
  const d = (date: Date | null) => formatDateOnly(date, locale) || dash;
  const current = data.coverages.filter((c) => c.isCurrent);
  const history = data.coverages.filter((c) => !c.isCurrent);
  const programsWithoutCoverage = data.programs.filter(
    (p) => !current.some((c) => c.programCode === p.code),
  );
  const common = {
    carriersByProgram: data.carriersByProgram,
    canConfigureCarriers: hasPermission(user, PERMISSIONS.SETTINGS_MANAGE),
  };
  const badge = (status: string) => (
    <span
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${STATUS_STYLE[status] ?? ""}`}
    >
      {t(`statuses.${status}` as "statuses.ACTIVE")}
    </span>
  );

  return (
    <div className="flex flex-col gap-5">
      <Card title={t("programsTitle")}>
        <p className="text-muted mb-3 text-[13px]">{t("programsHelp")}</p>
        {data.programs.length === 0 ? (
          <p className="text-muted text-sm">{t("noPrograms")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {data.programs.map((p) => (
              <div
                key={p.enrollmentId}
                className="border-border min-w-0 flex-[1_1_300px] rounded-lg border p-4"
              >
                <div className="font-semibold">{p.name[locale]}</div>
                <dl className="mt-2 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {p.code !== "ACA" && (
                    <DetailItem label={tc("detail.beneficiaryNumber")}>
                      {p.beneficiaryLast4 ? (
                        <RevealNumber
                          target={{ kind: "beneficiary", enrollmentId: p.enrollmentId }}
                          last4={p.beneficiaryLast4}
                          canReveal={data.canReveal}
                        />
                      ) : (
                        <span className="text-muted">{tc("detail.noNumber")}</span>
                      )}
                    </DetailItem>
                  )}
                  {p.code === "MEDICARE" && (
                    <>
                      <DetailItem label={tc("form.partA")}>{d(p.partAEffectiveDate)}</DetailItem>
                      <DetailItem label={tc("form.partB")}>{d(p.partBEffectiveDate)}</DetailItem>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t("currentTitle")}
        action={
          data.canWrite ? (
            <AddCoverageButton
              clientId={id}
              programs={programsWithoutCoverage.map((p) => ({ code: p.code, name: p.name }))}
              {...common}
            />
          ) : null
        }
      >
        {current.length === 0 ? (
          <p className="text-muted text-sm">{t("noCurrent")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {current.map((c) => (
              <article key={c.id} className="border-border rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-semibold">
                      {c.carrier.name} · {c.programName[locale]}
                    </h3>
                    {badge(c.status)}
                  </div>
                  {data.canWrite && <CoverageActions coverage={c} {...common} />}
                </div>
                <dl className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))] gap-x-6 gap-y-3">
                  <DetailItem label={t("plan")}>{c.planName ?? dash}</DetailItem>
                  <DetailItem label={t("member")}>
                    {c.memberLast4 ? (
                      <RevealNumber
                        target={{ kind: "insurance", insuranceId: c.id, field: "member" }}
                        last4={c.memberLast4}
                        canReveal={data.canReveal}
                      />
                    ) : (
                      dash
                    )}
                  </DetailItem>
                  <DetailItem label={t("confirmation")}>
                    {c.confirmationLast4 ? (
                      <RevealNumber
                        target={{ kind: "insurance", insuranceId: c.id, field: "confirmation" }}
                        last4={c.confirmationLast4}
                        canReveal={data.canReveal}
                      />
                    ) : (
                      dash
                    )}
                  </DetailItem>
                  <DetailItem label={t("submitted")}>{d(c.applicationSubmittedAt)}</DetailItem>
                  <DetailItem label={t("effective")}>{d(c.effectiveDate)}</DetailItem>
                  <DetailItem label={t("writingAgent")}>{c.writingAgentName ?? dash}</DetailItem>
                  {c.changeReason && <DetailItem label={t("reason")}>{c.changeReason}</DetailItem>}
                </dl>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card
        title={t("historyTitle")}
        action={<span className="text-muted text-xs">{t("historyNote")}</span>}
      >
        {history.length === 0 ? (
          <p className="text-muted text-sm">{t("noHistory")}</p>
        ) : (
          <ol className="flex flex-col">
            {history.map((c, i) => (
              <li key={c.id} className="flex gap-3.5">
                <div className="flex flex-col items-center">
                  <span aria-hidden className="mt-1.5 size-3 rounded-full bg-[#9aa3b2]" />
                  {i < history.length - 1 && (
                    <span aria-hidden className="w-0.5 flex-1 bg-[#e3e6ec]" />
                  )}
                </div>
                <div className="pb-5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {c.carrier.name} · {c.programName[locale]}
                    </span>
                    {badge(c.status)}
                  </div>
                  <div className="text-muted">
                    {d(c.effectiveDate)} – {c.endDate ? d(c.endDate) : dash}
                    {c.planName ? ` · ${c.planName}` : ""}
                    {c.memberLast4 ? ` · ${t("member")} •••• ${c.memberLast4}` : ""}
                  </div>
                  {c.replacedByCarrier && (
                    <div className="text-muted">
                      {t("replacedBy", { carrier: c.replacedByCarrier })}
                    </div>
                  )}
                  {c.changeReason && (
                    <div className="mt-0.5">
                      {t("reason")}: {c.changeReason}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
