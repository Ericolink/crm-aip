# ADR 0007 — CRUD de clientes

- **Estado:** aceptada (2026-11-18)

## Capas

| Capa       | Archivo                                                            | Responsabilidad                                                               |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Validación | `src/modules/clients/schema.ts`                                    | Esquema Zod único para navegador y servidor. Mensajes = claves de traducción  |
| Acceso     | `src/modules/clients/access.ts`                                    | Visibilidad por agente y campos editables por rol (funciones puras)           |
| Servicio   | `src/modules/clients/service.ts`                                   | Único punto de lectura/escritura: permisos, cifrado, historial, transacciones |
| Acciones   | `src/modules/clients/actions.ts`                                   | Server Actions: revalidan con Zod y traducen errores a códigos seguros        |
| Interfaz   | `src/modules/clients/components/*`, `app/[locale]/(app)/clients/*` | Lista, detalle, alta, edición, borrado                                        |

## Reglas

- **Visibilidad:** sin `client.read_all`, un usuario solo ve clientes con `assignedAgentId = su id`. Se aplica en cada consulta (lista, detalle, edición, revelar, borrar). Un cliente ajeno responde "no encontrado", no "prohibido", para no confirmar que existe.
- **Edición por rol:** `client.update` = todo; `client.update_basic` = solo contacto, dirección e idioma. Los demás campos se **ignoran en el servidor** aunque lleguen en la petición.
- **Asignación:** solo con `client.assign`. Sin ese permiso, el cliente queda asignado a quien lo crea.
- **Números sensibles:** el formulario nunca recibe el valor guardado (solo "últimos 4"). Campo vacío = no cambiar. El mismo número con otro formato no cuenta como cambio (se compara por índice ciego).
- **Revelar:** requiere `client.sensitive.reveal`, se registra en auditoría (`SENSITIVE_REVEALED`) y se oculta en el navegador a los 30 s.
- **Acceso al detalle** se registra en auditoría (`CLIENT_VIEWED`).
- **Borrado lógico** (solo administrador): el cliente desaparece de todas las vistas; sus datos e historial se conservan.
- **Condiciones:** un nombre propio que coincide con el catálogo se guarda como del catálogo (para poder filtrar).
- **Historial:** cada cambio (cliente, programas, condiciones) se registra en la misma transacción. Guardar sin cambios no genera registros.

## Pruebas

- Unitarias (`npm test`): esquema, formato, reglas de acceso.
- **Integración** (`npm run test:integration`): 21 pruebas contra PostgreSQL real en la base desechable `crm_test` (se recrea en cada ejecución; solo local).

## Decisiones pendientes

1. **Visibilidad del Asistente:** hoy un asistente solo ve los clientes asignados a él. Para que apoye a uno o varios agentes hace falta una relación asistente ↔ agente (tabla nueva, sin cambios en las existentes).
2. **Coberturas:** se registran desde el perfil (Etapa 5). Como `CarrierProgram` está vacía, se propone adelantar la pantalla de configuración aseguradoras × programas a la Etapa 5.
