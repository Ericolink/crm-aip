"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteClientAction } from "../actions";

export function DeleteClientButton({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const t = useTranslations("Clients");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteClientAction(clientId);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        setOpen(false);
        return;
      }
      toast.success(t("toast.deleted"));
      router.replace("/clients");
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-4" />
        {t("detail.delete")}
      </Button>
      <ConfirmDialog
        open={open}
        title={t("delete.title", { name: clientName })}
        body={t("delete.body")}
        confirmLabel={t("delete.confirm")}
        cancelLabel={t("delete.cancel")}
        pendingLabel={t("delete.deleting")}
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
