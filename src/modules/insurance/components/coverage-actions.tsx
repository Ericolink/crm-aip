"use client";

import { ArrowLeftRight, Ban, Lock, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import type { ActionResult } from "@/lib/action-result";
import { maskLast4 } from "@/lib/crypto/sensitive-field";
import { toDateInputValue } from "@/lib/format";
import { Link } from "@/i18n/navigation";
import {
  addCoverageAction,
  changeCarrierAction,
  endCoverageAction,
  updateCoverageAction,
} from "../actions";
import {
  addCoverageSchema,
  changeCarrierSchema,
  CLOSED_INSURANCE_STATUSES,
  endCoverageSchema,
  OPEN_INSURANCE_STATUSES,
  updateCoverageSchema,
} from "../schema";

type CarrierOption = { id: string; name: string };
type ProgramOption = { code: string; name: { es: string; en: string } };

export type EditableCoverage = {
  id: string;
  programCode: string;
  programName: { es: string; en: string };
  carrier: CarrierOption;
  planName: string | null;
  status: string;
  memberLast4: string | null;
  confirmationLast4: string | null;
  applicationSubmittedAt: Date | null;
  effectiveDate: Date | null;
};

type Mode = "add" | "edit" | "change" | "end";

type Common = {
  carriersByProgram: Record<string, CarrierOption[]>;
  canConfigureCarriers: boolean;
};

/** Convierte un formulario en objeto (los campos vacíos quedan como ""). */
function formObject(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
}

function useCoverageSubmit(onDone: () => void) {
  const t = useTranslations("Insurance");
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(
    schema: {
      safeParse: (v: unknown) => {
        success: boolean;
        error?: { issues: { path: PropertyKey[]; message: string }[] };
      };
    },
    values: Record<string, string>,
    action: () => Promise<ActionResult>,
    successKey: "added" | "updated" | "changed" | "ended",
  ) {
    // Misma validación que el servidor, para avisar de inmediato.
    const local = schema.safeParse(values);
    if (!local.success) {
      const next: Record<string, string> = {};
      for (const issue of local.error!.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      toast.error(t("errors.invalid"));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t(`toast.${successKey}`));
        onDone();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      toast.error(t(`errors.${result.error}`));
    });
  }

  const err = (field: string) =>
    errors[field] ? t(`validation.${errors[field]}` as "validation.required") : undefined;
  return { pending, submit, err };
}

/** Campos comunes de una póliza (plan, estado, fechas y números). */
function PolicyFields({
  err,
  initial,
  hideNumbersHint,
}: {
  err: (f: string) => string | undefined;
  initial?: EditableCoverage;
  hideNumbersHint?: boolean;
}) {
  const t = useTranslations("Insurance");
  const savedHint = (last4: string | null | undefined) =>
    !hideNumbersHint && last4 ? t("dialog.savedNumber", { masked: maskLast4(last4) }) : undefined;
  return (
    <>
      <Field
        label={t("plan")}
        name="planName"
        defaultValue={initial?.planName ?? ""}
        maxLength={120}
        error={err("planName")}
      />
      <SelectField
        label={t("status")}
        name="status"
        defaultValue={initial?.status === "ACTIVE" ? "ACTIVE" : "APPLICATION_PENDING"}
        options={OPEN_INSURANCE_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
        error={err("status")}
      />
      <Field
        label={t("submitted")}
        name="applicationSubmittedAt"
        type="date"
        defaultValue={toDateInputValue(initial?.applicationSubmittedAt)}
        error={err("applicationSubmittedAt")}
      />
      <Field
        label={t("effective")}
        name="effectiveDate"
        type="date"
        defaultValue={toDateInputValue(initial?.effectiveDate)}
        error={err("effectiveDate")}
      />
      {(["member", "confirmation"] as const).map((kind) => (
        <div key={kind} className="relative">
          <Field
            label={t(kind)}
            name={kind === "member" ? "memberNumber" : "confirmationNumber"}
            autoComplete="off"
            spellCheck={false}
            className="font-mono tracking-wide"
            hint={savedHint(kind === "member" ? initial?.memberLast4 : initial?.confirmationLast4)}
            error={err(kind === "member" ? "memberNumber" : "confirmationNumber")}
          />
          <span className="text-muted absolute top-0 right-0 inline-flex items-center gap-1 text-[11px] font-medium">
            <Lock aria-hidden className="size-3" />
            {t("dialog.encrypted")}
          </span>
        </div>
      ))}
    </>
  );
}

function NoCarriers({ programName, canConfigure }: { programName: string; canConfigure: boolean }) {
  const t = useTranslations("Insurance");
  return (
    <Alert tone="info">
      {t("noCarriers", { program: programName })}{" "}
      {canConfigure && (
        <Link href="/settings/carriers" className="font-semibold underline">
          {t("configureCarriers")}
        </Link>
      )}
    </Alert>
  );
}

const grid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]";

function Footer({
  pending,
  onCancel,
  label,
}: {
  pending: boolean;
  onCancel: () => void;
  label?: string;
}) {
  const t = useTranslations("Insurance.dialog");
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {t("cancel")}
      </Button>
      <Button type="submit" variant={label ? "danger" : "primary"} disabled={pending}>
        {pending ? t("saving") : (label ?? t("save"))}
      </Button>
    </div>
  );
}

/** Botón y formulario para registrar una cobertura en un programa sin cobertura actual. */
export function AddCoverageButton({
  clientId,
  programs,
  ...common
}: Common & { clientId: string; programs: ProgramOption[] }) {
  const t = useTranslations("Insurance");
  const locale = useLocale() as "es" | "en";
  const [open, setOpen] = useState(false);
  const [program, setProgram] = useState(programs[0]?.code ?? "");
  const { pending, submit, err } = useCoverageSubmit(() => setOpen(false));
  const carriers = common.carriersByProgram[program] ?? [];
  const programName = programs.find((p) => p.code === program)?.name[locale] ?? program;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e.currentTarget);
    submit(addCoverageSchema, values, () => addCoverageAction(clientId, values), "added");
  }

  if (programs.length === 0) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {t("add")}
      </Button>
      <Modal
        open={open}
        title={t("dialog.addTitle")}
        closeLabel={t("dialog.cancel")}
        onClose={() => setOpen(false)}
        busy={pending}
      >
        <form onSubmit={onSubmit} noValidate>
          <div className={grid}>
            <SelectField
              label={t("program")}
              name="programCode"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              options={programs.map((p) => ({ value: p.code, label: p.name[locale] }))}
              error={err("programCode")}
            />
            {carriers.length > 0 ? (
              <SelectField
                key={program}
                label={t("carrier")}
                name="carrierId"
                placeholder={t("dialog.choose")}
                options={carriers.map((c) => ({ value: c.id, label: c.name }))}
                error={err("carrierId")}
              />
            ) : (
              <div className="col-span-full">
                <NoCarriers programName={programName} canConfigure={common.canConfigureCarriers} />
              </div>
            )}
            {carriers.length > 0 && <PolicyFields err={err} />}
          </div>
          {carriers.length > 0 && <Footer pending={pending} onCancel={() => setOpen(false)} />}
        </form>
      </Modal>
    </>
  );
}

/** Acciones sobre la cobertura actual: editar, cambiar de aseguradora y terminar. */
export function CoverageActions({ coverage, ...common }: Common & { coverage: EditableCoverage }) {
  const t = useTranslations("Insurance");
  const locale = useLocale() as "es" | "en";
  const [mode, setMode] = useState<Mode | null>(null);
  const close = () => setMode(null);
  const { pending, submit, err } = useCoverageSubmit(close);
  const carriers = common.carriersByProgram[coverage.programCode] ?? [];

  function onEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e.currentTarget);
    submit(
      updateCoverageSchema,
      values,
      () => updateCoverageAction(coverage.id, values),
      "updated",
    );
  }
  function onChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e.currentTarget);
    submit(changeCarrierSchema, values, () => changeCarrierAction(coverage.id, values), "changed");
  }
  function onEnd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e.currentTarget);
    submit(endCoverageSchema, values, () => endCoverageAction(coverage.id, values), "ended");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setMode("edit")}>
        <Pencil aria-hidden className="size-3.5" />
        {t("edit")}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setMode("change")}>
        <ArrowLeftRight aria-hidden className="size-3.5" />
        {t("change")}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setMode("end")}>
        <Ban aria-hidden className="size-3.5" />
        {t("end")}
      </Button>

      <Modal
        open={mode === "edit"}
        title={t("dialog.editTitle")}
        description={`${coverage.carrier.name} · ${coverage.programName[locale]}`}
        closeLabel={t("dialog.cancel")}
        onClose={close}
        busy={pending}
      >
        <form onSubmit={onEdit} noValidate>
          <div className={grid}>
            <PolicyFields err={err} initial={coverage} />
          </div>
          <Footer pending={pending} onCancel={close} />
        </form>
      </Modal>

      <Modal
        open={mode === "change"}
        title={t("dialog.changeTitle")}
        description={t("dialog.changeHelp", { carrier: coverage.carrier.name })}
        closeLabel={t("dialog.cancel")}
        onClose={close}
        busy={pending}
      >
        {carriers.length === 0 ? (
          <NoCarriers
            programName={coverage.programName[locale]}
            canConfigure={common.canConfigureCarriers}
          />
        ) : (
          <form onSubmit={onChange} noValidate>
            <div className={grid}>
              <SelectField
                label={t("carrier")}
                name="carrierId"
                placeholder={t("dialog.choose")}
                options={carriers.map((c) => ({ value: c.id, label: c.name }))}
                error={err("carrierId")}
              />
              <PolicyFields err={err} hideNumbersHint />
              <Field
                label={t("dialog.previousEndDate")}
                name="previousEndDate"
                type="date"
                hint={t("dialog.previousEndHint")}
                error={err("previousEndDate") ?? err("endDate")}
              />
              <div className="col-span-full">
                <Field
                  label={t("reason")}
                  name="changeReason"
                  maxLength={300}
                  error={err("changeReason")}
                />
              </div>
            </div>
            <Footer pending={pending} onCancel={close} />
          </form>
        )}
      </Modal>

      <Modal
        open={mode === "end"}
        title={t("dialog.endTitle")}
        description={t("dialog.endHelp")}
        closeLabel={t("dialog.cancel")}
        onClose={close}
        busy={pending}
      >
        <form onSubmit={onEnd} noValidate>
          <div className={grid}>
            <SelectField
              label={t("dialog.endStatus")}
              name="status"
              defaultValue="ENDED"
              options={CLOSED_INSURANCE_STATUSES.map((s) => ({
                value: s,
                label: t(`statuses.${s}`),
              }))}
              error={err("status")}
            />
            <Field label={t("endDate")} name="endDate" type="date" error={err("endDate")} />
            <div className="col-span-full">
              <Field label={t("reason")} name="reason" maxLength={300} error={err("reason")} />
            </div>
          </div>
          <Footer pending={pending} onCancel={close} label={t("dialog.confirmEnd")} />
        </form>
      </Modal>
    </div>
  );
}
