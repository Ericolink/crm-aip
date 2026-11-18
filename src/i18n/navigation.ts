import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Usar SIEMPRE estos helpers en lugar de los de `next/link` / `next/navigation`
// para que los enlaces conserven el idioma actual.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
