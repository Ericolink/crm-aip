# ADR 0008 — Vínculos asistente ↔ agente

- **Estado:** aceptada (2026-11-18)

## Contexto

Un asistente apoya a uno o varios agentes y debe trabajar con los clientes de esos agentes, sin ampliar sus permisos (solo contacto y dirección, notas y recordatorios).

## Decisión

- Tabla `assistant_agent_links` (N:M): `assistantId`, `agentId`, `isActive`, `createdById`, `deactivatedAt`. Único por par; un usuario no puede vincularse consigo mismo (CHECK). Los vínculos **no se borran**: se desactivan (trazabilidad).
- Solo se vincula un usuario con rol **Asistente** a un usuario con rol **Agente o Administrador** (los clientes de Alejandro están asignados a un administrador).
- **Visibilidad** (`clientVisibilityWhere`): sin `client.read_all`, el usuario ve los clientes asignados a él **y** a sus agentes vinculados activos.
- Los agentes vinculados se cargan en **cada petición** junto con el usuario (`loadCurrentUser`), solo si el vínculo y el agente están activos. Desactivar el vínculo, o desactivar al agente, quita el acceso en la siguiente petición; no hay caché.
- Los vínculos **no amplían permisos**: el asistente sigue sin poder revelar números, crear, eliminar ni editar datos médicos.
- Administración: **Configuración → Usuarios y vínculos**, con permiso `user.manage`. Cada alta/baja de vínculo se registra en auditoría (`ASSISTANT_LINK_CREATED` / `ASSISTANT_LINK_REMOVED`).
- `loadCurrentUser` vive en un módulo sin dependencias de Next para que las pruebas de integración usen exactamente la misma lógica que la sesión real.

## Pruebas

`tests/integration/assistant-links.test.ts` (11 pruebas): permisos de administración, validación de roles, N:M, idempotencia, acceso por vínculo, permisos conservados, pérdida inmediata de acceso al desactivar vínculo o agente, recuperación al reactivar, y que los vínculos no afectan a otros usuarios.
