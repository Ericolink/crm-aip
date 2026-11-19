import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { NotesPanel } from "@/modules/notes/components/notes-panel";
import { listClientNotes } from "@/modules/notes/service";

/** Pestaña "Notas": línea de tiempo de seguimientos, con notas importantes destacadas. */
export default async function ClientNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const importantOnly = (await searchParams).important === "1";
  const data = await listClientNotes(user, id, { importantOnly });
  if (!data) notFound();
  return (
    <NotesPanel
      clientId={id}
      notes={data.notes}
      canCreate={data.canCreate}
      importantOnly={importantOnly}
      importantCount={data.importantCount}
    />
  );
}
