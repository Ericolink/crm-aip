import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/** Rutas accesibles sin sesión (después del prefijo de idioma). */
const PUBLIC_PATHS = ["/login"];

function stripLocale(pathname: string): { locale: string; path: string } {
  const [, maybeLocale, ...rest] = pathname.split("/");
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    return { locale: maybeLocale, path: "/" + rest.join("/") };
  }
  return { locale: routing.defaultLocale, path: pathname };
}

/**
 * Proxy (antes "middleware").
 * 1. Resuelve el idioma (/es, /en) con next-intl.
 * 2. Verificación OPTIMISTA: si no hay cookie de sesión, redirige al login.
 *    Solo mira si la cookie existe; la validación real (sesión vigente, usuario activo,
 *    permisos) ocurre SIEMPRE en el servidor en src/lib/auth/session.ts.
 */
export default function proxy(request: NextRequest) {
  const intlResponse = intlMiddleware(request);
  // Si next-intl redirige (p. ej. "/" → "/es"), se respeta esa redirección primero.
  if (intlResponse.headers.has("location")) return intlResponse;

  const { locale, path } = stripLocale(request.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isPublic && !getSessionCookie(request)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  return intlResponse;
}

export const config = {
  // Excluye rutas internas, API y archivos estáticos (cualquier ruta con punto).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
