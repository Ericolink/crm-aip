import { getLocale } from "next-intl/server";
import { Suspense, type ReactNode } from "react";
import { Toaster } from "sonner";
import { GlobalSearch } from "@/components/app-shell/global-search";
import { IdleTimeout } from "@/components/app-shell/idle-timeout";
import { SidebarNav, type NavItem } from "@/components/app-shell/sidebar-nav";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { overdueCountForUser } from "@/modules/reminders/service";

/**
 * Estructura de la aplicación autenticada.
 * Con Cache Components, la lectura de sesión debe ir dentro de <Suspense>:
 * el esqueleto se muestra al instante y el contenido llega cuando se valida la sesión.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const locale = (await getLocale()) as "es" | "en";
  const canReminders = hasPermission(user, PERMISSIONS.REMINDER_MANAGE);
  const overdue = canReminders ? await overdueCountForUser(user) : 0;

  // Solo se muestran las secciones que el rol permite.
  const main: NavItem[] = [
    { key: "dashboard", href: "/dashboard", available: true },
    { key: "clients", href: "/clients", available: true },
    ...(canReminders
      ? [{ key: "reminders", href: "/reminders", available: true, badge: overdue } as const]
      : []),
    ...(hasPermission(user, PERMISSIONS.DATA_IMPORT) || hasPermission(user, PERMISSIONS.DATA_EXPORT)
      ? [{ key: "importExport", href: "/import-export", available: true } as const]
      : []),
  ];
  const secondary: NavItem[] = [
    ...(hasPermission(user, PERMISSIONS.SETTINGS_MANAGE) ||
    hasPermission(user, PERMISSIONS.USER_MANAGE) ||
    hasPermission(user, PERMISSIONS.AUDIT_READ)
      ? [{ key: "settings", href: "/settings", available: true } as const]
      : []),
    { key: "account", href: "/account", available: true },
  ];

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="bg-canvas flex min-h-screen flex-wrap">
      <aside className="border-border bg-surface flex flex-[1_1_232px] flex-col gap-1 border-b px-3.5 py-5 sm:border-r sm:border-b-0">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <div className="bg-primary-dark flex size-[34px] items-center justify-center rounded-[9px] text-[13px] font-bold text-white">
            AA
          </div>
          <div className="text-sm leading-tight font-semibold">
            CRM
            <br />
            <span className="text-muted text-xs font-medium">Alejandro Alcazar</span>
          </div>
        </div>
        <SidebarNav main={main} secondary={secondary} />
        <div className="mt-2 flex items-center gap-2.5 border-t border-[#edf0f4] px-2 pt-3">
          <div className="bg-status-new-bg text-status-new-fg flex size-8 items-center justify-center rounded-full text-xs font-semibold">
            {initials}
          </div>
          <div className="min-w-0 flex-1 text-[13px] leading-tight">
            <div className="truncate font-semibold">{user.name}</div>
            <div className="text-muted text-xs">{user.roleName[locale]}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5 sm:px-8">
          <GlobalSearch />
          <LocaleSwitcher />
        </header>
        <main className="w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-7">{children}</main>
      </div>
      <IdleTimeout />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="bg-canvas flex min-h-screen flex-wrap" aria-busy="true">
      <div className="border-border bg-surface flex-[1_1_232px] border-r" />
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 p-8">
        <div className="h-6 w-48 rounded-md bg-[#e9ecf1]" />
        <div className="h-4 w-80 rounded-md bg-[#e9ecf1]" />
      </div>
    </div>
  );
}
