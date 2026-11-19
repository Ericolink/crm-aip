import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ConditionsManager } from "@/modules/catalogs/components/conditions-manager";
import { listConditions } from "@/modules/catalogs/service";

export default async function ConditionsSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.SETTINGS_MANAGE)) return <Forbidden />;
  return <ConditionsManager conditions={await listConditions(user)} />;
}
