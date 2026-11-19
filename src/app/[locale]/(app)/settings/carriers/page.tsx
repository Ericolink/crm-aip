import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { CarriersManager } from "@/modules/carriers/components/carriers-manager";
import { listCarriersWithPrograms } from "@/modules/carriers/service";

export default async function CarriersSettingsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.SETTINGS_MANAGE)) return <Forbidden />;
  const { programs, carriers } = await listCarriersWithPrograms(user);
  return <CarriersManager programs={programs} carriers={carriers} />;
}
