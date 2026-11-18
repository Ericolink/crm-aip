"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { useForm, useWatch, type FieldPath, type FieldErrors } from "react-hook-form";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import { maskLast4 } from "@/lib/crypto/sensitive-field";
import { Link, useRouter } from "@/i18n/navigation";
import { saveClientAction } from "../actions";
import type { ClientEditScope } from "../access";
import {
  CLIENT_STATUSES,
  clientFormSchema,
  PREFERRED_LANGUAGES,
  PROGRAM_CODES,
  RELATIONSHIPS,
  type ClientFormInput,
  type ClientFormValues,
} from "../schema";

type Props = {
  clientId: string | null;
  defaultValues: ClientFormInput;
  scope: ClientEditScope;
  savedNumbersLast4?: { MEDICARE: string | null; MEDICAID: string | null };
  conditions: { id: string; nameEs: string; nameEn: string }[];
  agents: { id: string; name: string }[];
  canAssign: boolean;
};

/** Mensaje de error de un campo anidado ("programs.MEDICARE.beneficiaryNumber"). */
function errorAt(errors: FieldErrors<ClientFormInput>, path: string): string | undefined {
  const node = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], errors);
  return (node as { message?: string } | undefined)?.message;
}

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-border bg-surface scroll-mt-6 rounded-xl border p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#eef0f4] text-[11px] font-bold text-[#3a4356]">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const grid = "grid gap-x-5 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]";

export function ClientForm(props: Props) {
  const { clientId, scope, conditions, agents, canAssign, savedNumbersLast4 } = props;
  const t = useTranslations("Clients");
  const locale = useLocale();
  const router = useRouter();
  const full = scope === "full";

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormInput, unknown, ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: props.defaultValues,
    mode: "onBlur",
  });

  const err = (path: string) => {
    const key = errorAt(errors, path);
    return key ? t(`validation.${key}` as "validation.required") : undefined;
  };

  const sameMailing = useWatch({ control, name: "mailingSameAsHome" });
  const relationship = useWatch({ control, name: "altContactRelationship" });
  const programs = useWatch({ control, name: "programs" });
  const customConditions = useWatch({ control, name: "customConditions" }) ?? [];
  const [customDraft, setCustomDraft] = useState("");

  function addCustomCondition() {
    const name = customDraft.trim();
    if (!name) return;
    if (!customConditions.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setValue("customConditions", [...customConditions, name], { shouldDirty: true });
    }
    setCustomDraft("");
  }

  async function onValid() {
    // Se envían los valores tal como están en el formulario; el servidor vuelve a validarlos.
    const result = await saveClientAction(clientId, getValues());
    if (!result.ok) {
      for (const [path, key] of Object.entries(result.fieldErrors ?? {})) {
        setError(path as FieldPath<ClientFormInput>, { message: key });
      }
      toast.error(t(`errors.${result.error}`));
      return;
    }
    toast.success(clientId ? t("toast.updated") : t("toast.created"));
    router.push(`/clients/${result.data.id}`);
  }

  function onInvalid() {
    toast.error(t("errors.invalid"));
  }

  const sections = [
    { id: "personal", show: full },
    { id: "contact", show: true },
    { id: "address", show: true },
    { id: "programs", show: full },
    { id: "conditions", show: full },
    { id: "assignment", show: full && canAssign },
  ].filter((s) => s.show);
  const number = (id: string) => sections.findIndex((s) => s.id === id) + 1;

  const options = {
    status: CLIENT_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
    language: PREFERRED_LANGUAGES.map((l) => ({ value: l, label: t(`language.${l}`) })),
    relationship: RELATIONSHIPS.map((r) => ({ value: r, label: t(`relationship.${r}`) })),
  };

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate className="pb-28">
      <div className="flex flex-wrap gap-7">
        <nav
          aria-label={t("form.sectionsNav")}
          className="flex flex-[1_1_200px] flex-col gap-0.5 self-start lg:sticky lg:top-6"
        >
          <h1 className="mb-1 text-[22px] font-bold">
            {clientId ? t("form.titleEdit") : t("form.titleNew")}
          </h1>
          <p className="text-muted mb-4 text-[13px]">{t("form.requiredNote")}</p>
          {sections.map((s, i) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-[#333c4e] hover:bg-[#eef0f4]"
            >
              <span className="flex size-[22px] items-center justify-center rounded-full bg-[#eef0f4] text-[11px] font-bold">
                {i + 1}
              </span>
              {t(`form.sections.${s.id}` as "form.sections.personal")}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          {!full && <Alert tone="info">{t("form.basicOnly")}</Alert>}

          {full && (
            <Section id="personal" n={number("personal")} title={t("form.sections.personal")}>
              <div className={grid}>
                <Field
                  label={`${t("form.firstName")} *`}
                  autoComplete="off"
                  error={err("firstName")}
                  {...register("firstName")}
                />
                <Field
                  label={`${t("form.lastName")} *`}
                  autoComplete="off"
                  error={err("lastName")}
                  {...register("lastName")}
                />
                <Field
                  label={t("form.dob")}
                  type="date"
                  error={err("dateOfBirth")}
                  {...register("dateOfBirth")}
                />
                <SelectField
                  label={t("form.preferredLanguage")}
                  options={options.language}
                  {...register("preferredLanguage")}
                />
                <SelectField
                  label={t("form.status")}
                  options={options.status}
                  {...register("status")}
                />
              </div>
            </Section>
          )}

          <Section id="contact" n={number("contact")} title={t("form.sections.contact")}>
            <div className={grid}>
              <Field
                label={t("form.primaryPhone")}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                error={err("primaryPhone")}
                {...register("primaryPhone")}
              />
              <Field
                label={t("form.email")}
                type="email"
                autoComplete="off"
                error={err("email")}
                {...register("email")}
              />
              {!full && (
                <SelectField
                  label={t("form.preferredLanguage")}
                  options={options.language}
                  {...register("preferredLanguage")}
                />
              )}
              <Field
                label={t("form.altPhone")}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                error={err("altPhone")}
                {...register("altPhone")}
              />
              <Field
                label={t("form.altContactName")}
                autoComplete="off"
                error={err("altContactName")}
                {...register("altContactName")}
              />
              <SelectField
                label={t("form.relationship")}
                placeholder={t("form.choose")}
                options={options.relationship}
                {...register("altContactRelationship")}
              />
              {relationship === "OTHER" && (
                <Field
                  label={`${t("form.relationshipOther")} *`}
                  error={err("altContactRelationshipOther")}
                  {...register("altContactRelationshipOther")}
                />
              )}
            </div>
          </Section>

          <Section id="address" n={number("address")} title={t("form.sections.address")}>
            <div className={grid}>
              <div className="col-span-full">
                <Field
                  label={t("form.street")}
                  autoComplete="off"
                  error={err("homeStreet")}
                  {...register("homeStreet")}
                />
              </div>
              <Field
                label={t("form.unit")}
                autoComplete="off"
                error={err("homeUnit")}
                {...register("homeUnit")}
              />
              <Field
                label={t("form.city")}
                autoComplete="off"
                error={err("homeCity")}
                {...register("homeCity")}
              />
              <Field
                label={t("form.state")}
                maxLength={2}
                autoComplete="off"
                error={err("homeState")}
                {...register("homeState")}
              />
              <Field
                label={t("form.zip")}
                inputMode="numeric"
                autoComplete="off"
                error={err("homeZip")}
                {...register("homeZip")}
              />
            </div>
            <label className="mt-5 flex items-center gap-2.5 font-medium">
              <input type="checkbox" className="size-[18px]" {...register("mailingSameAsHome")} />
              {t("form.sameMailing")}
            </label>
            {!sameMailing && (
              <div className="border-border mt-4 rounded-xl border bg-[#f8f9fb] p-4">
                <h3 className="text-sm font-semibold">{t("form.mailingTitle")}</h3>
                <div className={`${grid} mt-3`}>
                  <div className="col-span-full">
                    <Field
                      label={`${t("form.street")} *`}
                      autoComplete="off"
                      error={err("mailingStreet")}
                      {...register("mailingStreet")}
                    />
                  </div>
                  <Field label={t("form.unit")} autoComplete="off" {...register("mailingUnit")} />
                  <Field
                    label={`${t("form.city")} *`}
                    autoComplete="off"
                    error={err("mailingCity")}
                    {...register("mailingCity")}
                  />
                  <Field
                    label={`${t("form.state")} *`}
                    maxLength={2}
                    autoComplete="off"
                    error={err("mailingState")}
                    {...register("mailingState")}
                  />
                  <Field
                    label={`${t("form.zip")} *`}
                    inputMode="numeric"
                    autoComplete="off"
                    error={err("mailingZip")}
                    {...register("mailingZip")}
                  />
                </div>
              </div>
            )}
          </Section>

          {full && (
            <Section id="programs" n={number("programs")} title={t("form.sections.programs")}>
              <p className="text-muted text-[13px]">{t("form.programsHelp")}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {PROGRAM_CODES.map((code) => {
                  const on = programs?.[code]?.enabled;
                  return (
                    <label
                      key={code}
                      className={`flex flex-[1_1_200px] cursor-pointer items-start gap-2.5 rounded-xl border p-3.5 ${
                        on
                          ? "border-primary ring-primary bg-[#f5f8ff] ring-1"
                          : "border-border-strong bg-surface"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-[18px]"
                        {...register(`programs.${code}.enabled`)}
                      />
                      <span>
                        <span className="block font-semibold">{t(`programs.${code}`)}</span>
                        <span className="text-muted text-xs">{t(`form.programHelp.${code}`)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {clientId && (
                <p className="text-muted mt-3 text-xs">{t("form.removeProgramWarning")}</p>
              )}

              {programs?.MEDICARE?.enabled && (
                <div className="border-border mt-4 rounded-xl border bg-[#f8f9fb] p-4">
                  <h3 className="text-sm font-semibold">{t("form.medicareData")}</h3>
                  <div className={`${grid} mt-3`}>
                    <SensitiveInput
                      label={t("form.mbi")}
                      encryptedLabel={t("form.encrypted")}
                      hint={
                        savedNumbersLast4?.MEDICARE
                          ? t("form.savedNumber", { masked: maskLast4(savedNumbersLast4.MEDICARE) })
                          : undefined
                      }
                      error={err("programs.MEDICARE.beneficiaryNumber")}
                      {...register("programs.MEDICARE.beneficiaryNumber")}
                    />
                    <Field
                      label={t("form.partA")}
                      type="date"
                      error={err("programs.MEDICARE.partAEffectiveDate")}
                      {...register("programs.MEDICARE.partAEffectiveDate")}
                    />
                    <Field
                      label={t("form.partB")}
                      type="date"
                      error={err("programs.MEDICARE.partBEffectiveDate")}
                      {...register("programs.MEDICARE.partBEffectiveDate")}
                    />
                  </div>
                </div>
              )}
              {programs?.MEDICAID?.enabled && (
                <div className="border-border mt-4 rounded-xl border bg-[#f8f9fb] p-4">
                  <h3 className="text-sm font-semibold">{t("form.medicaidData")}</h3>
                  <div className={`${grid} mt-3`}>
                    <SensitiveInput
                      label={t("form.medicaidNumber")}
                      encryptedLabel={t("form.encrypted")}
                      hint={
                        savedNumbersLast4?.MEDICAID
                          ? t("form.savedNumber", { masked: maskLast4(savedNumbersLast4.MEDICAID) })
                          : undefined
                      }
                      error={err("programs.MEDICAID.beneficiaryNumber")}
                      {...register("programs.MEDICAID.beneficiaryNumber")}
                    />
                  </div>
                </div>
              )}
              {programs?.ACA?.enabled && (
                <div className="border-border mt-4 rounded-xl border bg-[#f8f9fb] p-4">
                  <h3 className="text-sm font-semibold">{t("programs.ACA")}</h3>
                  <p className="text-muted mt-1 text-[13px]">{t("form.acaNote")}</p>
                </div>
              )}
            </Section>
          )}

          {full && (
            <Section id="conditions" n={number("conditions")} title={t("form.sections.conditions")}>
              <p className="text-muted text-[13px]">{t("form.conditionsHelp")}</p>
              <div className="mt-4 grid [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {conditions.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f8f9fb]"
                  >
                    <input
                      type="checkbox"
                      value={c.id}
                      className="size-4"
                      {...register("conditionIds")}
                    />
                    {locale === "en" ? c.nameEn : c.nameEs}
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {customConditions.map((name) => (
                  <span
                    key={name}
                    className="border-border-strong inline-flex h-8 items-center gap-1.5 rounded-md border bg-[#f8f9fb] pr-1 pl-3 text-sm"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={t("form.remove", { name })}
                      onClick={() =>
                        setValue(
                          "customConditions",
                          customConditions.filter((c) => c !== name),
                          { shouldDirty: true },
                        )
                      }
                      className="text-muted inline-flex size-6 cursor-pointer items-center justify-center rounded hover:bg-[#eef0f4]"
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-3 flex max-w-md items-end gap-2">
                <div className="flex-1">
                  <Field
                    label={t("form.customCondition")}
                    placeholder={t("form.customConditionPlaceholder")}
                    value={customDraft}
                    maxLength={80}
                    onChange={(e) => setCustomDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomCondition();
                      }
                    }}
                  />
                </div>
                <Button variant="secondary" onClick={addCustomCondition}>
                  <Plus aria-hidden className="size-4" />
                  {t("form.addCustom")}
                </Button>
              </div>
            </Section>
          )}

          {full && canAssign && (
            <Section id="assignment" n={number("assignment")} title={t("form.sections.assignment")}>
              <div className={grid}>
                <SelectField
                  label={t("form.agent")}
                  placeholder={clientId ? undefined : t("form.agentDefault")}
                  options={agents.map((a) => ({ value: a.id, label: a.name }))}
                  error={err("assignedAgentId")}
                  {...register("assignedAgentId")}
                />
              </div>
            </Section>
          )}
        </div>
      </div>

      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-end gap-2.5 border-t px-4 py-3.5 sm:px-8">
        <span className="text-muted mr-auto hidden text-[13px] sm:inline">
          {t("form.footerNote")}
        </span>
        <Link
          href={clientId ? `/clients/${clientId}` : "/clients"}
          className={buttonClasses("secondary")}
        >
          {t("form.cancel")}
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("form.saving") : t("form.save")}
        </Button>
      </div>
    </form>
  );
}

/** Campo para identificadores sensibles: sin autocompletar, sin corrector, fuente monoespaciada. */
function SensitiveInput({
  label,
  encryptedLabel,
  ...props
}: React.ComponentProps<typeof Field> & { encryptedLabel: string }) {
  return (
    <div className="relative">
      <Field
        label={label}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        className="font-mono tracking-wide"
        {...props}
      />
      <span className="text-muted absolute top-0 right-0 inline-flex items-center gap-1 text-[11px] font-medium">
        <Lock aria-hidden className="size-3" />
        {encryptedLabel}
      </span>
    </div>
  );
}
