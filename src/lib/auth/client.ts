"use client";

import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

/**
 * Cliente de autenticación para componentes del navegador.
 * Habla con /api/auth/* en el mismo dominio (no se configura baseURL).
 * `import type` solo trae los tipos del servidor; ningún código de servidor llega al navegador.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>(), twoFactorClient()],
});

/**
 * Navegación completa (no SPA) tras iniciar o cerrar sesión.
 * - Descarta la caché del router del navegador, para que no queden datos de clientes en memoria.
 * - `replace` evita que el botón "atrás" vuelva a una página protegida tras cerrar sesión.
 */
export function hardNavigate(path: string) {
  window.location.replace(path);
}
