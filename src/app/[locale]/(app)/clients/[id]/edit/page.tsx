import { notFound } from "next/navigation";
import { Forbidden } from "@/components/forbidden";
import { requireUser } from "@/lib/auth/session";
import { clientEditScope } from "@/modules/clients/access";
import { ClientForm } from "@/modules/clients/components/client-form";
import { getClientForEdit, getClientFormOptions } from "@/modules/clients/service";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (clientEditScope(user) === "none") return <Forbidden />;

  const { id } = await params;
  const data = await getClientForEdit(user, id);
  if (!data) notFound();
  const options = await getClientFormOptions(user, data.values.conditionIds);

  return (
    <ClientForm
      clientId={id}
      defaultValues={data.values}
      scope={data.scope}
      savedNumbersLast4={data.savedNumbersLast4}
      conditions={options.conditions}
      agents={options.agents}
      canAssign={options.canAssign}
    />
  );
}
