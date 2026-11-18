import { getLocale, getTranslations } from "next-intl/server";
import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLE_KEYS } from "@/lib/permissions/catalog";
import { AssistantLinksEditor } from "@/modules/users/components/assistant-links-editor";
import { listUsersWithLinks } from "@/modules/users/service";

export default async function UsersSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.USER_MANAGE)) return <Forbidden />;

  const t = await getTranslations("Settings.users");
  const locale = (await getLocale()) as "es" | "en";
  const users = await listUsersWithLinks(user);
  const availableAgents = users
    .filter((u) => u.isActive && (u.role.key === ROLE_KEYS.AGENT || u.role.key === ROLE_KEYS.ADMIN))
    .map((u) => ({ id: u.id, name: u.name }));
  const dateTime = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-US", {
          timeZone: "America/New_York",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(d)
      : t("never");

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-muted mt-1 text-sm">{t("subtitle")}</p>
      </div>
      <section className="border-border bg-surface rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs font-semibold text-[#4a5366]">
                {(["user", "role", "status", "lastLogin", "clients", "links"] as const).map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className="border-border border-b bg-[#f8f9fb] px-4 py-2.5"
                  >
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-[#f1f3f6] align-top ${u.isActive ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-muted text-xs break-all">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">{u.role.name[locale]}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ${
                        u.isActive
                          ? "bg-status-active-bg text-status-active-fg"
                          : "bg-[#eef0f4] text-[#3a4356]"
                      }`}
                    >
                      {u.isActive ? t("active") : t("inactive")}
                    </span>
                  </td>
                  <td className="text-muted px-4 py-3">{dateTime(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">{u.assignedClients}</td>
                  <td className="px-4 py-3">
                    {u.role.key === ROLE_KEYS.ASSISTANT ? (
                      <AssistantLinksEditor
                        assistant={{ id: u.id, name: u.name }}
                        linkedAgents={u.linkedAgents}
                        availableAgents={u.isActive ? availableAgents : []}
                      />
                    ) : u.linkedAssistants.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted text-xs">{t("linkedAssistants")}</span>
                        {u.linkedAssistants.map((a) => (
                          <span
                            key={a.id}
                            className="border-border-strong rounded-md border bg-[#f8f9fb] px-2 py-0.5 text-xs font-medium"
                          >
                            {a.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-muted text-xs">{t("managementSoon")}</p>
    </div>
  );
}
