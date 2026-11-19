"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { exportClientsAction } from "../actions";
import { saveDownload } from "./download";

/**
 * Botón + ventana de exportación. `query` = filtros actuales de la lista (o "" para todos).
 * Los identificadores completos solo se ofrecen a quien puede exportarlos, con confirmación.
 */
export function ExportButton({
  query,
  count,
  canIncludeSensitive,
  seesInsurance,
  variant = "secondary",
}: {
  query: string;
  count: number;
  canIncludeSensitive: boolean;
  seesInsurance: boolean;
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("DataTransfer");
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"XLSX" | "CSV">("XLSX");
  const [sensitive, setSensitive] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setSensitive(false);
    setConfirmed(false);
    setError(null);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await exportClientsAction({
        format,
        query,
        includeSensitive: sensitive && confirmed,
      });
      if (r.ok) {
        saveDownload(r.data);
        toast.success(t("export.done", { count: r.data.rowCount }));
        close();
      } else {
        const code = r.fieldErrors?.export;
        setError(code === "tooManyRows" ? t("exportErrors.tooManyRows") : t(`errors.${r.error}`));
      }
    });
  }

  const optionClass = (active: boolean) =>
    `flex flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm font-medium ${
      active
        ? "border-primary bg-primary-soft text-primary-dark"
        : "border-border-strong hover:bg-canvas"
    }`;

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Download aria-hidden className="size-4" />
        {t("export.button")}
      </Button>
      <Modal
        open={open}
        title={t("export.dialogTitle")}
        closeLabel={t("export.close")}
        onClose={close}
        busy={pending}
      >
        <div className="flex flex-col gap-4 text-sm">
          <p>{t("export.bodyFiltered", { count })}</p>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-[#4a5366]">
              {t("export.format")}
            </legend>
            <div className="flex gap-2">
              {(["XLSX", "CSV"] as const).map((f) => (
                <label key={f} className={optionClass(format === f)}>
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="sr-only"
                  />
                  {f === "XLSX" ? t("export.excel") : t("export.csv")}
                </label>
              ))}
            </div>
          </fieldset>
          {seesInsurance && !sensitive && <p className="text-muted">{t("export.masked")}</p>}
          {canIncludeSensitive && (
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={sensitive}
                  onChange={(e) => {
                    setSensitive(e.target.checked);
                    setConfirmed(false);
                  }}
                  className="mt-0.5 size-4"
                />
                {t("export.sensitive")}
              </label>
              {sensitive && (
                <>
                  <Alert tone="error">{t("export.sensitiveWarning")}</Alert>
                  <label className="flex cursor-pointer items-start gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="mt-0.5 size-4"
                    />
                    {t("export.sensitiveConfirm")}
                  </label>
                </>
              )}
            </div>
          )}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={pending}>
              {t("export.close")}
            </Button>
            <Button onClick={run} disabled={pending || count === 0 || (sensitive && !confirmed)}>
              <Download aria-hidden className="size-4" />
              {pending ? t("export.downloading") : t("export.download")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
