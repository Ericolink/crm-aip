# ADR 0005 — Autenticación, roles y auditoría

- **Estado:** aceptada (2026-11-18)

## Decisión

### Base de datos

- **Prisma 7.10.1** (estable) con conector `@prisma/adapter-pg`. Prisma marca como "latest" una 8.0 RC; no se usan versiones candidatas.
- Cliente generado en `src/generated/prisma` (no versionado; `npm install` lo regenera).
- `prisma.config.ts` carga `.env` con `process.loadEnvFile` (sin dependencia `dotenv`).
- npm 11 bloquea scripts de instalación: se aprobaron solo `prisma`, `@prisma/engines` y `esbuild` (lista en `allowScripts` de `package.json`).

### Autenticación — Better Auth 1.7.26

| Control                     | Valor                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Registro público            | Deshabilitado. Los usuarios los crea un administrador (Etapa 12) o el seed inicial.            |
| Contraseñas                 | Mínimo 12, máximo 128 caracteres. Hash scrypt. Cambiarla cierra las demás sesiones.            |
| 2FA (TOTP)                  | **Obligatoria.** Sin 2FA solo se puede acceder a `/setup-2fa`. No se puede desactivar.         |
| Códigos de respaldo         | 10, de un solo uso, mostrados una sola vez.                                                    |
| Bloqueo 2FA                 | 5 códigos incorrectos → 15 min bloqueado.                                                      |
| Límite de intentos (por IP) | Login: 5 cada 5 min. Código 2FA: 5 por minuto. Guardado en la base (`rate_limits`).            |
| Inactividad                 | 15 min. Aviso a los 13 min. La actividad renueva la sesión como máximo cada 2 min.             |
| Duración máxima             | 12 h desde el inicio de sesión, aunque haya actividad.                                         |
| Recordar dispositivo (2FA)  | Opcional, 30 días (aprobado en el diseño).                                                     |
| Sesiones                    | En base de datos, sin caché en cookie: revocar o desactivar al usuario tiene efecto inmediato. |
| Usuario desactivado         | No puede crear sesión; si tenía una, se cierra en la siguiente petición.                       |
| Telemetría de Better Auth   | Desactivada.                                                                                   |

### Roles y permisos

- Claves de permiso en código (`src/lib/permissions/catalog.ts`); asignación rol→permiso en base de datos (`roles`, `permissions`, `role_permissions`), editable sin tocar código.
- Roles iniciales: **Administrador** (todo), **Agente** (sus clientes, médicos, medicamentos, aseguranzas, notas, recordatorios, revelar identificadores), **Asistente** (consulta, datos básicos, notas, recordatorios; sin información médica ni identificadores completos).
- El seed solo asigna permisos al **crear** un rol; si ya existe, respeta los cambios hechos desde la interfaz (excepto ADMIN, que siempre recibe todos).
- Toda verificación pasa por `requireUser()` / `requirePermission()` en `src/lib/auth/session.ts` (Data Access Layer). El proxy solo hace una comprobación optimista de la cookie.

### Auditoría

- Tabla `audit_logs` **de solo inserción**: un trigger de PostgreSQL rechaza `UPDATE`, `DELETE` y `TRUNCATE`.
- Eventos: login correcto/fallido, 2FA requerida/fallida/activada, usuario inactivo bloqueado, cierre de sesión, sesión vencida por límite absoluto, cambio de contraseña, acceso denegado, cambio de preferencia.
- Los metadatos pasan por una lista de exclusión (contraseñas, códigos, tokens, correos, teléfonos, identificadores médicos, direcciones): nunca se guardan.
- Los usuarios no se borran (FK `Restrict`); se desactivan.

### Cache Components

- La lectura de sesión siempre ocurre dentro de `<Suspense>` (exigido por Next 16).
- La validación de sesión se ejecuta una vez por petición (`React.cache`), y los efectos (cerrar sesión vencida) son idempotentes.
- Tras iniciar o cerrar sesión se hace navegación completa (`location.replace`) para vaciar la caché del router del navegador.

## Pendiente / limitaciones conocidas

- **IP del cliente:** se toma de `x-forwarded-for`. En producción debe configurarse la cabecera del proxy de confianza (`advanced.ipAddress`) para que el límite por IP no se pueda evadir.
- Un usuario desactivado que intenta entrar recibe un error 500 de Better Auth (`FAILED_TO_CREATE_SESSION`); la interfaz muestra un mensaje claro, pero el código HTTP no es el ideal.
- Restablecer contraseña por correo: requiere un proveedor de correo con BAA (se decidirá con el hosting). Mientras tanto, un administrador restablece contraseñas (Etapa 12).
- Componentes de interfaz propios (Button, Field, Alert). shadcn/ui se incorporará cuando se necesiten diálogos, menús y tablas complejas (Etapa 3).
