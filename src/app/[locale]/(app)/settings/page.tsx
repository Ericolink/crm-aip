import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

export default async function SettingsIndex() {
  return redirect({ href: "/settings/users", locale: await getLocale() });
}
