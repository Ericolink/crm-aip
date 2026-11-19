import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ConsentTypesManager } from "@/modules/catalogs/components/consent-types-manager";
import { listConsentTypes } from "@/modules/catalogs/service";

export default async function ConsentTypesSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.SETTINGS_MANAGE)) return <Forbidden />;
  return <ConsentTypesManager types={await listConsentTypes(user)} />;
}
