"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/action-result";
import { analyzeImportAction, runImportAction, templateAction } from "../actions";
import { columnLabel, type ImportColumnKey } from "../columns";
import type { ImportPreview, ImportResult } from "../import-service";
import { saveDownload } from "./download";

/**
 * Importación en dos pasos: revisar (no guarda nada) → confirmar.
 * El archivo se queda en el navegador y se reenvía al confirmar; el servidor no lo guarda.
 */
export function ImportPanel() {
  const t = useTranslations("DataTransfer");
  const locale = useLocale() === "en" ? "en" : "es";
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"analyze" | "import" | null>(null);

  const errorText = (r: Extract<ActionResult<unknown>, { ok: false }>) => {
    const code = r.fieldErrors?.file;
    return code && t.has(`fileErrors.${code}`)
      ? t(`fileErrors.${code}` as "fileErrors.empty")
      : t(`errors.${r.error}`);
  };
  const issueText = (code: string) =>
    t.has(`issueCodes.${code}`) ? t(`issueCodes.${code}` as "issueCodes.required") : code;
  const colText = (key: ImportColumnKey | null) => (key ? columnLabel(key, locale) : "—");

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function send(kind: "analyze" | "import") {
    if (!file) return setError(t("import.selectFile"));
    setError(null);
    setAction(kind);
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      if (kind === "analyze") {
        const r = await analyzeImportAction(data);
        if (r.ok) setPreview(r.data);
        else setError(errorText(r));
      } else {
        const r = await runImportAction(data);
        if (r.ok) {
          setResult(r.data);
          setPreview(null);
        } else setError(errorText(r));
      }
      setAction(null);
    });
  }

  function template(format: "XLSX" | "CSV") {
    startTransition(async () => {
      const r = await templateAction(format);
      if (r.ok) saveDownload(r.data);
      else setError(t(`errors.${r.error}`));
    });
  }

  const shown = result ?? preview;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>{t("import.body")}</p>
      <p className="text-muted">{t("import.rules")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => template("XLSX")} disabled={pending}>
          <FileSpreadsheet aria-hidden className="size-4" />
          {t("import.template")} (.xlsx)
        </Button>
        <Button variant="secondary" size="sm" onClick={() => template("CSV")} disabled={pending}>
          <FileSpreadsheet aria-hidden className="size-4" />
          {t("import.template")} (.csv)
        </Button>
      </div>

      {!result && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
            <span className="text-xs font-semibold text-[#4a5366]">{t("import.file")}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="border-border-strong file:bg-canvas rounded-lg border p-1.5 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:px-3 file:py-1.5 file:font-medium"
            />
          </label>
          <Button onClick={() => send("analyze")} disabled={pending || !file}>
            {action === "analyze" ? t("import.analyzing") : t("import.analyze")}
          </Button>
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {shown && (
        <section
          aria-live="polite"
          className="border-border flex flex-col gap-3 rounded-xl border p-4"
        >
          <h3 className="text-[15px] font-semibold">
            {result ? t("import.resultTitle") : t("import.previewTitle")}
          </h3>
          {result ? (
            <Alert tone="success">
              {t("import.result", {
                imported: result.imported,
                skipped: result.totalRows - result.imported,
              })}
            </Alert>
          ) : (
            <p className="text-muted">{t("import.nothingSaved")}</p>
          )}
          <dl className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2">
            {(
              [
                ["total", shown.totalRows, ""],
                ["valid", shown.validRows, "text-status-active-fg"],
                ["invalid", shown.invalidRows, shown.invalidRows ? "text-danger" : ""],
                [
                  "duplicates",
                  shown.duplicateRows,
                  shown.duplicateRows ? "text-status-pending-fg" : "",
                ],
              ] as const
            ).map(([k, v, tone]) => (
              <div key={k} className="bg-canvas rounded-lg px-3 py-2">
                <dt className="text-muted text-xs">{t(`import.${k}`)}</dt>
                <dd className={`text-xl font-bold ${tone}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p>
            <span className="text-muted">{t("import.columns")}: </span>
            {shown.recognizedColumns.map((c) => columnLabel(c, locale)).join(", ")}
          </p>
          {shown.ignoredHeaders.length > 0 && (
            <p>
              <span className="text-muted">{t("import.ignored")}: </span>
              {shown.ignoredHeaders.join(", ")}
            </p>
          )}
          {shown.issues.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-lg border border-[#edf0f4]">
              <table className="w-full text-left text-[13px]">
                <caption className="sr-only">{t("import.issues")}</caption>
                <thead className="bg-canvas sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-semibold">{t("import.row")}</th>
                    <th className="px-3 py-2 font-semibold">{t("import.column")}</th>
                    <th className="px-3 py-2 font-semibold">{t("import.problem")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.issues.map((i, n) => (
                    <tr key={n} className="border-t border-[#f1f3f6]">
                      <td className="px-3 py-1.5 tabular-nums">{i.row}</td>
                      <td className="px-3 py-1.5">{colText(i.column)}</td>
                      <td className="px-3 py-1.5">{issueText(i.code)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {shown.truncated && <p className="text-muted text-xs">{t("import.truncated")}</p>}

          <div className="flex flex-wrap justify-end gap-2">
            {result ? (
              <>
                <Button variant="secondary" onClick={reset}>
                  {t("import.another")}
                </Button>
                <Link href="/clients" className={buttonClasses("primary")}>
                  {t("import.viewClients")}
                </Link>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={reset} disabled={pending}>
                  {t("import.cancel")}
                </Button>
                {shown.validRows > 0 ? (
                  <Button onClick={() => send("import")} disabled={pending}>
                    <Upload aria-hidden className="size-4" />
                    {action === "import"
                      ? t("import.importing")
                      : t("import.confirm", { count: shown.validRows })}
                  </Button>
                ) : (
                  <Alert tone="error">{t("import.noneValid")}</Alert>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
