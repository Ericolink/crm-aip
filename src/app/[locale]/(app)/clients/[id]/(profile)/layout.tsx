import { ChevronLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { ageFrom, initials } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { Link } from "@/i18n/navigation";
import { clientEditScope } from "@/modules/clients/access";
import { DeleteClientButton } from "@/modules/clients/components/delete-client-button";
import { ProfileTabs, type ProfileTab } from "@/modules/clients/components/profile-tabs";
import { StatusBadge } from "@/modules/clients/components/status-badge";
import { StatusMenu } from "@/modules/clients/components/status-menu";
import { getClientDetailForRequest } from "@/modules/clients/queries";

/** Cabecera del cliente y pestañas, compartidas por todas las secciones del perfil. */
export default async function ClientProfileLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const user = await requireUser();
  const { id } = await params;
  const client = await getClientDetailForRequest(user, id);
  if (!client) notFound();

  const t = await getTranslations("Clients");
  const locale = (await getLocale()) as "es" | "en";
  const name = `${client.firstName} ${client.lastName}`;
  const age = ageFrom(client.dateOfBirth);
  const status = client.status as "NEW" | "PENDING" | "ACTIVE" | "URGENT";
  const dateTime = (d: Date) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);

  // Solo las pestañas que el rol puede ver.
  const tabs: ProfileTab[] = [
    "overview",
    ...(client.access.insurance ? (["insurance"] as const) : []),
    ...(client.access.medical ? (["doctors", "medications"] as const) : []),
    "notes",
    "activity",
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/clients"
        className="text-primary inline-flex items-center gap-1 self-start text-[13px] font-medium hover:underline"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {t("detail.back")}
      </Link>

      <section className="border-border bg-surface rounded-xl border">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div
            className={`flex size-14 items-center justify-center rounded-full text-lg font-bold ${
              status === "URGENT"
                ? "bg-status-urgent-bg text-status-urgent-fg"
                : "bg-status-new-bg text-status-new-fg"
            }`}
          >
            {initials(client.firstName, client.lastName)}
          </div>
          <div className="min-w-0 flex-[1_1_280px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-bold">{name}</h1>
              {clientEditScope(user) === "full" ? (
                <StatusMenu key={status} clientId={client.id} clientName={name} status={status} />
              ) : (
                <StatusBadge status={status} label={t(`status.${status}`)} />
              )}
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
        </div>
        <ProfileTabs clientId={client.id} tabs={tabs} />
      </section>

      {children}
    </div>
  );
}
