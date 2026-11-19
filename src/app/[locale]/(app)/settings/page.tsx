import { getLocale } from "next-intl/server";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { redirect } from "@/i18n/navigation";

/** Abre la primera sección de configuración que el rol permite. */
export default async function SettingsIndex() {
  const user = await requireUser();
  const href = hasPermission(user, PERMISSIONS.USER_MANAGE)
    ? "/settings/users"
    : "/settings/carriers";
  return redirect({ href, locale: await getLocale() });
}
