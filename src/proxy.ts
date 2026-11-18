import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Proxy (antes "middleware" en Next.js < 16).
 * Etapa 0: solo resuelve el idioma (/es, /en) y redirige rutas sin prefijo.
 * Etapa 1: se agregará la verificación optimista de sesión. La autorización real
 * se valida SIEMPRE en el servidor (servicios), nunca solo aquí.
 */
export default createMiddleware(routing);

export const config = {
  // Excluye rutas internas, API y archivos estáticos (cualquier ruta con punto).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
