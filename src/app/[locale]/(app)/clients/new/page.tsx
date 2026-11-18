import { Forbidden } from "@/components/forbidden";
import { hasPermission, requireUser } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions/catalog";
import { ClientForm } from "@/modules/clients/components/client-form";
import { emptyClientForm } from "@/modules/clients/schema";
import { getClientFormOptions } from "@/modules/clients/service";

export default async function NewClientPage() {
  const user = await requireUser();
  if (!hasPermission(user, PERMISSIONS.CLIENT_CREATE)) return <Forbidden />;
  const options = await getClientFormOptions(user);

  return (
    <ClientForm
      clientId={null}
      defaultValues={emptyClientForm()}
      scope="full"
      conditions={options.conditions}
      agents={options.agents}
      canAssign={options.canAssign}
    />
  );
}
