import { ComingSoon } from "@/components/coming-soon";
import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";

export default async function ClientMedicationsPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.MEDICAL_READ)) return <Forbidden />;
  return <ComingSoon stage={7} />;
}
