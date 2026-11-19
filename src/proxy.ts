import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { buildCsp, createNonce } from "./lib/security/csp";

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
 * 0. Genera el nonce y la Content-Security-Policy de la petición.
 * 1. Resuelve el idioma (/es, /en) con next-intl.
 * 2. Verificación OPTIMISTA: si no hay cookie de sesión, redirige al login.
 *    Solo mira si la cookie existe; la validación real (sesión vigente, usuario activo,
 *    permisos) ocurre SIEMPRE en el servidor en src/lib/auth/session.ts.
 */
export default function proxy(request: NextRequest) {
  // CSP con un nonce nuevo en cada petición. Next.js lo lee del encabezado de la PETICIÓN y
  // lo pone en sus propios scripts; next-intl copia estos encabezados al reenviar la petición.
  const nonce = createNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const intlResponse = intlMiddleware(request);
  intlResponse.headers.set("Content-Security-Policy", csp);
  // Si next-intl redirige (p. ej. "/" → "/es"), se respeta esa redirección primero.
  if (intlResponse.headers.has("location")) return intlResponse;

  const { locale, path } = stripLocale(request.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isPublic && !getSessionCookie(request)) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  return intlResponse;
}

export const config = {
  // Excluye rutas internas, API y archivos estáticos (cualquier ruta con punto).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
