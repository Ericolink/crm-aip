import { notFound } from "next/navigation";
import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { MedicationsPanel } from "@/modules/medications/components/medications-panel";
import { getClientMedications } from "@/modules/medications/service";

/** Pestaña "Medicamentos": lista independiente de las pólizas. */
export default async function ClientMedicationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.MEDICAL_READ)) return <Forbidden />;
  const { id } = await params;
  const data = await getClientMedications(user, id);
  if (!data) notFound();
  return (
    <MedicationsPanel
      clientId={id}
      medications={data.medications}
      prescribers={data.prescribers}
      canWrite={data.canWrite}
    />
  );
}
