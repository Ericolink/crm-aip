import { notFound } from "next/navigation";
import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { DoctorsPanel } from "@/modules/doctors/components/doctors-panel";
import { getClientDoctors } from "@/modules/doctors/service";

/** Pestaña "Médicos": PCP destacado y especialistas. */
export default async function ClientDoctorsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.MEDICAL_READ)) return <Forbidden />;
  const { id } = await params;
  const data = await getClientDoctors(user, id);
  if (!data) notFound();
  return (
    <DoctorsPanel
      clientId={id}
      pcp={data.pcp}
      specialists={data.specialists}
      canWrite={data.canWrite}
    />
  );
}
