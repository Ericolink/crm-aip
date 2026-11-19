import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { Card } from "@/components/ui/card";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { clientVisibilityWhere } from "@/modules/clients/access";
import { ExportButton } from "@/modules/data-transfer/components/export-button";
import { ImportPanel } from "@/modules/data-transfer/components/import-panel";
import { canExportSensitive } from "@/modules/data-transfer/export-service";
import { listRecentJobs } from "@/modules/data-transfer/jobs";

/** Importar clientes desde CSV/XLSX y exportar la lista completa visible. */
export default async function ImportExportPage() {
  const user = await requireUser();
  const canImport =
    hasPermission(user, PERMISSIONS.DATA_IMPORT) && hasPermission(user, PERMISSIONS.CLIENT_CREATE);
  const canExport = hasPermission(user, PERMISSIONS.DATA_EXPORT);
  if (!canImport && !canExport) return <Forbidden />;

  const t = await getTranslations("DataTransfer");
  const locale = await getLocale();
  const [visibleCount, jobs] = await Promise.all([
    canExport ? prisma.client.count({ where: clientVisibilityWhere(user) }) : 0,
    listRecentJobs(user),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
    timeZone: "America/New_York",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted mt-0.5">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {canImport && (
          <div className="min-w-0 flex-[3_1_480px]">
            <Card title={t("import.title")}>
              <ImportPanel />
            </Card>
          </div>
        )}
        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
          {canExport && (
            <Card title={t("export.title")}>
              <div className="flex flex-col gap-3 text-sm">
                <p>{t("export.body")}</p>
                <p className="text-muted">{t("export.fromList")}</p>
                <div>
                  <ExportButton
                    query=""
                    count={visibleCount}
                    canIncludeSensitive={canExportSensitive(user)}
                    seesInsurance={hasPermission(user, PERMISSIONS.INSURANCE_READ)}
                    variant="primary"
                  />
                </div>
              </div>
            </Card>
          )}
          <Card title={t("history.title")}>
            <div className="flex flex-col gap-4 text-[13px]">
              {canImport && (
                <section>
                  <h3 className="text-muted mb-1.5 text-xs font-semibold uppercase">
                    {t("history.imports")}
                  </h3>
                  {jobs.imports.length === 0 ? (
                    <p className="text-muted">{t("history.empty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {jobs.imports.map((j) => (
                        <li key={j.id}>
                          {t("history.importLine", {
                            name: j.createdBy.name,
                            imported: j.importedRows,
                            total: j.totalRows,
                          })}
                          <span className="text-muted block text-xs">
                            {dateTime.format(j.createdAt)} · {j.fileName}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {canExport && (
                <section>
                  <h3 className="text-muted mb-1.5 text-xs font-semibold uppercase">
                    {t("history.exports")}
                  </h3>
                  {jobs.exports.length === 0 ? (
                    <p className="text-muted">{t("history.empty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {jobs.exports.map((j) => (
                        <li key={j.id}>
                          {t("history.exportLine", {
                            name: j.createdBy.name,
                            count: j.rowCount,
                            format: j.format,
                          })}
                          {j.includesSensitive && (
                            <span className="text-danger font-semibold">
                              {" "}
                              · {t("history.sensitive")}
                            </span>
                          )}
                          <span className="text-muted block text-xs">
                            {dateTime.format(j.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
