"use client";

import { KeyRound, Plus, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SelectField } from "@/components/ui/select-field";
import type { ActionResult } from "@/lib/action-result";
import { PASSWORD_POLICY } from "@/lib/auth/policy";
import {
  createUserAction,
  resetPasswordAction,
  resetTwoFactorAction,
  setUserActiveAction,
  updateUserAction,
} from "../admin-actions";

export type RoleOption = { key: string; name: { es: string; en: string } };
export type AgentOption = { id: string; name: string };
export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  preferredLocale: "es" | "en";
  isActive: boolean;
  assignedClients: number;
  pendingReminders: number;
  isSelf: boolean;
};

type Errors = Record<string, string>;
type Failure = Extract<ActionResult<unknown>, { ok: false }>;

function useTexts() {
  const t = useTranslations("Settings.users");
  const tc = useTranslations("Common");
  const locale: "es" | "en" = useLocale() === "en" ? "en" : "es";
  const fieldError = (code: string | undefined) =>
    code
      ? t.has(`fieldErrors.${code}`)
        ? t(`fieldErrors.${code}` as "fieldErrors.required", { min: PASSWORD_POLICY.minLength })
        : t("fieldErrors.invalidOption")
      : null;
  /** Mensaje general de un fallo: errores específicos de la acción o el genérico del módulo. */
  const failure = (r: Failure) => {
    const code = r.fieldErrors?.user ?? r.fieldErrors?.reassignToId;
    if (code === "self" || code === "lastAdmin") return t(`actionErrors.${code}`);
    if (r.fieldErrors?.reassignToId) return t("actionErrors.reassign");
    return t(`errors.${r.error}`);
  };
  const languages = [
    { value: "es", label: tc("languages.es") },
    { value: "en", label: tc("languages.en") },
  ];
  return { t, locale, fieldError, failure, languages };
}

/** Campos comunes del alta y la edición. */
function UserFields({
  roles,
  defaults,
  errors,
  roleKey,
  onRoleChange,
  roleLocked,
}: {
  roles: RoleOption[];
  defaults?: Partial<ManagedUser>;
  errors: Errors;
  roleKey: string;
  onRoleChange: (key: string) => void;
  roleLocked?: boolean;
}) {
  const { t, locale, fieldError, languages } = useTexts();
  return (
    <>
      <Field
        label={t("form.name")}
        name="name"
        defaultValue={defaults?.name}
        maxLength={80}
        autoComplete="off"
        required
        error={fieldError(errors.name)}
      />
      <Field
        label={t("form.email")}
        name="email"
        type="email"
        defaultValue={defaults?.email}
        maxLength={254}
        autoComplete="off"
        required
        error={fieldError(errors.email)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <SelectField
            label={t("form.role")}
            name="roleKey"
            value={roleKey}
            onChange={(e) => onRoleChange(e.target.value)}
            disabled={roleLocked}
            options={roles.map((r) => ({ value: r.key, label: r.name[locale] }))}
            error={fieldError(errors.roleKey)}
          />
          {roleLocked && <p className="text-muted text-xs">{t("form.roleSelfHint")}</p>}
        </div>
        <SelectField
          label={t("form.locale")}
          name="preferredLocale"
          defaultValue={defaults?.preferredLocale ?? locale}
          options={languages}
          error={fieldError(errors.preferredLocale)}
        />
      </div>
      {t.has(`form.roleHelp.${roleKey}`) && (
        <p className="text-muted -mt-1 text-[13px]">
          {t(`form.roleHelp.${roleKey}` as "form.roleHelp.AGENT")}
        </p>
      )}
    </>
  );
}

function PasswordFields({ errors }: { errors: Errors }) {
  const { t, fieldError } = useTexts();
  return (
    <>
      <Field
        label={t("form.password")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={PASSWORD_POLICY.minLength}
        maxLength={PASSWORD_POLICY.maxLength}
        hint={t("form.passwordHint", { min: PASSWORD_POLICY.minLength })}
        required
        error={fieldError(errors.password)}
      />
      <Field
        label={t("form.passwordConfirm")}
        name="passwordConfirm"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(errors.passwordConfirm)}
      />
    </>
  );
}

/** Revisa en el navegador que las dos contraseñas coincidan (el servidor valida el resto). */
function readPassword(form: FormData): { password: string; errors: Errors } {
  const password = String(form.get("password") ?? "");
  const errors: Errors = {};
  if (password.length < PASSWORD_POLICY.minLength) errors.password = "tooShort";
  else if (password !== String(form.get("passwordConfirm") ?? ""))
    errors.passwordConfirm = "mismatch";
  return { password, errors };
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 pt-1">{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alta
// ─────────────────────────────────────────────────────────────────────────────

export function NewUserButton({ roles }: { roles: RoleOption[] }) {
  const { t, failure } = useTexts();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState("AGENT");
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setErrors({});
    setError(null);
    setRoleKey("AGENT");
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { password, errors: pwErrors } = readPassword(form);
    if (Object.keys(pwErrors).length) return setErrors(pwErrors);
    startTransition(async () => {
      const r = await createUserAction({
        name: form.get("name"),
        email: form.get("email"),
        roleKey,
        preferredLocale: form.get("preferredLocale"),
        password,
      });
      if (r.ok) {
        toast.success(t("toast.created"));
        close();
      } else {
        setErrors(r.fieldErrors ?? {});
        setError(r.fieldErrors ? null : failure(r));
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4" />
        {t("newUser")}
      </Button>
      <Modal
        open={open}
        title={t("form.createTitle")}
        description={t("form.createDescription")}
        closeLabel={t("form.cancel")}
        onClose={close}
        busy={pending}
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <UserFields roles={roles} errors={errors} roleKey={roleKey} onRoleChange={setRoleKey} />
          <PasswordFields errors={errors} />
          <Actions>
            <Button variant="secondary" onClick={close} disabled={pending}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("form.creating") : t("form.create")}
            </Button>
          </Actions>
        </form>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestión de un usuario
// ─────────────────────────────────────────────────────────────────────────────

type View = "edit" | "password" | "twoFactor" | "deactivate" | "reactivate";

function AgentPicker({
  agents,
  label,
  error,
}: {
  agents: AgentOption[];
  label: string;
  error?: string | null;
}) {
  const { t } = useTexts();
  return (
    <SelectField
      label={label}
      name="reassignToId"
      placeholder={t("form.choose")}
      defaultValue=""
      options={agents.map((a) => ({ value: a.id, label: a.name }))}
      error={error}
    />
  );
}

export function ManageUserButton({
  user,
  roles,
  agents,
}: {
  user: ManagedUser;
  roles: RoleOption[];
  /** Agentes y administradores activos que pueden recibir clientes (sin incluir a este usuario). */
  agents: AgentOption[];
}) {
  const { t, fieldError, failure } = useTexts();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("edit");
  const [roleKey, setRoleKey] = useState(user.roleKey);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toAssistant =
    roleKey === "ASSISTANT" && user.roleKey !== "ASSISTANT" && user.assignedClients > 0;
  const fromAssistant = user.roleKey === "ASSISTANT" && roleKey !== "ASSISTANT";
  const hasWork = user.assignedClients > 0 || user.pendingReminders > 0;

  function go(next: View) {
    setView(next);
    setErrors({});
    setError(null);
  }
  function close() {
    setOpen(false);
    go("edit");
    setRoleKey(user.roleKey);
  }

  function run(
    action: () => Promise<ActionResult<unknown>>,
    success: (data: unknown) => string,
    keepOpen = false,
  ) {
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        toast.success(success(r.data));
        if (keepOpen) go("edit");
        else close();
      } else {
        const fe = r.fieldErrors ?? {};
        const specific = fe.user || fe.reassignToId;
        setErrors(fe);
        setError(specific || !r.fieldErrors ? failure(r) : null);
      }
    });
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    run(
      () =>
        updateUserAction(
          user.id,
          {
            name: form.get("name"),
            email: form.get("email"),
            roleKey,
            preferredLocale: form.get("preferredLocale"),
          },
          form.get("reassignToId"),
        ),
      () => t("toast.saved"),
    );
  }

  function resetPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { password, errors: pwErrors } = readPassword(new FormData(e.currentTarget));
    if (Object.keys(pwErrors).length) return setErrors(pwErrors);
    run(
      () => resetPasswordAction(user.id, password),
      () => t("toast.passwordReset"),
      true,
    );
  }

  function deactivate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const target = new FormData(e.currentTarget).get("reassignToId");
    run(
      () => setUserActiveAction(user.id, false, target),
      (data) => {
        const moved = data as { clients: number; reminders: number };
        return moved.clients || moved.reminders
          ? t("toast.deactivatedMoved", moved)
          : t("toast.deactivated");
      },
    );
  }

  const security = [
    { view: "password" as const, icon: KeyRound, label: t("security.resetPassword") },
    { view: "twoFactor" as const, icon: ShieldOff, label: t("security.resetTwoFactor") },
    user.isActive
      ? { view: "deactivate" as const, icon: UserX, label: t("security.deactivate") }
      : { view: "reactivate" as const, icon: UserCheck, label: t("security.reactivate") },
  ];

  const back = (
    <Button variant="secondary" onClick={() => go("edit")} disabled={pending}>
      {t("form.back")}
    </Button>
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("manage")}
      </Button>
      <Modal
        open={open}
        title={t("manageTitle", { name: user.name })}
        closeLabel={t("form.cancel")}
        onClose={close}
        busy={pending}
      >
        {error && (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        )}

        {view === "edit" && (
          <div className="flex flex-col gap-6">
            <form onSubmit={save} className="flex flex-col gap-4" noValidate>
              <UserFields
                roles={roles}
                defaults={user}
                errors={errors}
                roleKey={roleKey}
                onRoleChange={setRoleKey}
                roleLocked={user.isSelf}
              />
              {toAssistant && (
                <>
                  <Alert tone="warning">
                    {t("form.toAssistantWarning", { count: user.assignedClients })}
                  </Alert>
                  <AgentPicker
                    agents={agents}
                    label={t("form.reassignTo")}
                    error={errors.reassignToId ? t("actionErrors.reassign") : null}
                  />
                </>
              )}
              {fromAssistant && <Alert tone="info">{t("form.fromAssistantWarning")}</Alert>}
              <Actions>
                <Button variant="secondary" onClick={close} disabled={pending}>
                  {t("form.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? t("form.saving") : t("form.save")}
                </Button>
              </Actions>
            </form>

            <section className="flex flex-col gap-2 border-t border-[#edf0f4] pt-4">
              <h3 className="text-[15px] font-semibold">{t("security.title")}</h3>
              {user.isSelf ? (
                <p className="text-muted text-sm">{t("security.selfNote")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {security.map((s) => (
                    <Button
                      key={s.view}
                      variant="secondary"
                      size="sm"
                      onClick={() => go(s.view)}
                      className={s.view === "deactivate" ? "text-danger" : ""}
                    >
                      <s.icon aria-hidden className="size-4" />
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {view === "password" && (
          <form onSubmit={resetPassword} className="flex flex-col gap-4" noValidate>
            <h3 className="text-[15px] font-semibold">{t("security.resetPassword")}</h3>
            <p className="text-muted text-sm">{t("security.resetPasswordBody")}</p>
            <PasswordFields errors={errors} />
            <Actions>
              {back}
              <Button type="submit" disabled={pending}>
                {pending ? t("security.working") : t("security.resetPasswordConfirm")}
              </Button>
            </Actions>
          </form>
        )}

        {view === "twoFactor" && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold">{t("security.resetTwoFactor")}</h3>
            <p className="text-muted text-sm">{t("security.resetTwoFactorBody")}</p>
            <Actions>
              {back}
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  run(
                    () => resetTwoFactorAction(user.id),
                    () => t("toast.twoFactorReset"),
                    true,
                  )
                }
              >
                {pending ? t("security.working") : t("security.resetTwoFactorConfirm")}
              </Button>
            </Actions>
          </div>
        )}

        {view === "deactivate" && (
          <form onSubmit={deactivate} className="flex flex-col gap-4" noValidate>
            <h3 className="text-[15px] font-semibold">{t("security.deactivate")}</h3>
            <p className="text-muted text-sm">{t("security.deactivateBody")}</p>
            {hasWork && (
              <>
                <Alert tone="warning">
                  {t("security.deactivateWork", {
                    clients: user.assignedClients,
                    reminders: user.pendingReminders,
                  })}
                </Alert>
                <AgentPicker
                  agents={agents}
                  label={t("security.reassignTo")}
                  error={fieldError(errors.reassignToId) && t("actionErrors.reassign")}
                />
              </>
            )}
            <Actions>
              {back}
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? t("security.working") : t("security.deactivateConfirm")}
              </Button>
            </Actions>
          </form>
        )}

        {view === "reactivate" && (
          <div className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold">{t("security.reactivate")}</h3>
            <p className="text-muted text-sm">{t("security.reactivateBody")}</p>
            <Actions>
              {back}
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => setUserActiveAction(user.id, true),
                    () => t("toast.reactivated"),
                  )
                }
              >
                {pending ? t("security.working") : t("security.reactivateConfirm")}
              </Button>
            </Actions>
          </div>
        )}
      </Modal>
    </>
  );
}
