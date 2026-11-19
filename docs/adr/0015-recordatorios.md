# ADR 0015 — Recordatorios y seguimientos

- **Estado:** propuesta para revisión (2026-11-19)

## Funcionalidad

| Dónde                 | Qué                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `/reminders`          | Vistas Pendientes / Vencidos / Completados / Cancelados con contadores; "Asignados a mí" (por defecto) o "De todos mis clientes". |
| Perfil → Resumen      | Tarjeta con los próximos 5 pendientes del cliente y botón "Nuevo recordatorio" (cliente ya elegido).                              |
| Panel principal       | "Próximos seguimientos" (Etapa 9) + enlace "Ver todos los recordatorios".                                                         |
| Menú lateral          | "Recordatorios" activo, con insignia roja = mis recordatorios vencidos.                                                           |
| Historial del cliente | Crear, editar/posponer, completar y cancelar quedan registrados (`entityType = reminder`, categoría Notas).                       |

Acciones por recordatorio pendiente: **Completar**, **Editar o posponer** (descripción, fecha/hora, prioridad, responsable), **Cancelar** (con confirmación) y **Llamar** (`tel:`). Completados y cancelados son de solo lectura.

## Reglas

- **Permiso:** `reminder.manage` (Administrador, Agente y Asistente lo tienen).
- **Visibilidad:** la misma que la lista de clientes. Un asistente ve y gestiona los recordatorios de los clientes de sus agentes vinculados; al desvincularlo o desactivarlo pierde el acceso al instante.
- **Responsable:** por defecto quien lo crea. Solo puede asignarse a un usuario activo que **pueda ver a ese cliente** (validado en servidor; la lista de opciones se calcula igual).
- **Zona horaria:** la fecha/hora se captura y muestra en **hora de Florida** (`America/New_York`) y se guarda en UTC. La conversión (`src/lib/timezone.ts`) maneja el cambio de horario de verano. Rango permitido: desde hace 1 año hasta dentro de 2 años.
- **Vencido** = pendiente con fecha/hora anterior al momento de la consulta (calculado en el servidor).
- Orden: pendientes/vencidos por fecha (lo más próximo primero); completados/cancelados por última modificación.
- Sin borrado: un recordatorio se cancela, no se elimina, para conservar la trazabilidad.
- La descripción no debe contener identificadores sensibles (Medicare, Medicaid, SSN); se indica al equipo, no se puede validar automáticamente.

## Arquitectura preparada para notificaciones (no implementado)

El envío por correo o WhatsApp **no se activa en esta etapa**. Diseño previsto:

1. **Cola de trabajos** con `pg-boss` (sobre el mismo PostgreSQL, sin servicio adicional): un trabajo periódico busca recordatorios que vencen pronto.
2. **Tabla `notification_deliveries`** (canal, destinatario, recordatorio, estado, intentos, error saneado) para no enviar dos veces y auditar cada envío.
3. **Contenido mínimo:** el aviso dirá "Tienes un seguimiento pendiente" con enlace al CRM; **nunca** datos de salud ni identificadores, porque correo y WhatsApp no son canales seguros para PHI.
4. **Requisitos previos:** proveedor de correo/WhatsApp con **BAA** si se envía cualquier dato del cliente; para avisos **al cliente**, consentimiento registrado (tabla `client_consents`, TCPA) y horario permitido.
5. Preferencias por usuario (canal, horario) en una etapa posterior.

Antes de instalar `pg-boss` o un proveedor se consultará y justificará la dependencia.

## Pruebas

- Unitarias (4): conversión hora de Florida ↔ UTC, incluido el cambio de horario de verano y horas inexistentes.
- Integración (11): hora guardada correctamente, responsable por defecto, asistente vinculado, asignación solo a quien ve al cliente, cliente ajeno, validación de fecha/texto, búsqueda sin acentos, orden y vencidos, "asignados a mí", posponer con historial (sin registro si no hay cambios), completar/cancelar y bloqueo posterior, otro agente sin acceso.
- Humo en servidor de producción (17): vistas y contadores, insignia del menú, vencidos primero, "todos mis clientes", vista inválida, tarjeta del perfil, historial con etiquetas traducidas y hora de Florida, enlace en el panel, inglés.
