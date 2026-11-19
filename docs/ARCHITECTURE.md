# CRM de seguros médicos — Arquitectura y planificación

> Documento vivo. Registra las decisiones técnicas aprobadas. Última actualización: 2026-11-18.
> Estado: Fases 1–2 aprobadas · Etapas 0–9 completadas · **Etapa 10 (recordatorios) en revisión**.
> Decisiones detalladas en [`docs/adr/`](adr/).

**Aviso:** este sistema se diseña considerando los requisitos de HIPAA (Privacy & Security Rules), pero **no se afirma que sea "HIPAA compliant"** hasta que su infraestructura, proveedores (BAA), contratos, controles y procedimientos sean revisados y validados formalmente.

---

## 1. Decisiones aprobadas

| #   | Tema                     | Decisión                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Arquitectura             | Monolito modular en TypeScript (Next.js App Router). Capas: UI → acciones → servicios (validación, permisos, auditoría) → repositorios → PostgreSQL.                                                                                                                                                                 |
| D2  | Base de datos local      | **Docker Desktop + PostgreSQL** mediante `docker-compose.yml`. Puerto ligado solo a `127.0.0.1`. Volumen persistente. Scripts `npm run db:up`, `db:down`, `db:reset`.                                                                                                                                                |
| D3  | Aseguradoras ↔ programas | **100 % configurable desde el CRM** (Configuración → Aseguradoras). El seed crea las 5 aseguradoras y los 3 programas **sin relaciones entre ellos**; no se asume qué compañía ofrece qué programa. Se pueden crear aseguradoras exclusivas de ACA.                                                                  |
| D4  | Idioma                   | **Bilingüe EN/ES.** Selector en la barra superior. El idioma se guarda en el perfil del usuario (`User.preferredLocale`) y en una cookie (para la pantalla de login).                                                                                                                                                |
| D5  | Condiciones crónicas     | **Lista múltiple** por cliente, CRUD individual, basada en un catálogo para poder filtrar en el futuro.                                                                                                                                                                                                              |
| D6  | Hosting                  | Solo local por ahora. Comparación de proveedores con BAA cuando exista una versión funcional. Nada de datos reales hasta entonces.                                                                                                                                                                                   |
| D8  | Asistentes               | **Vinculados a uno o varios agentes** (tabla `assistant_agent_links`, N:M). El asistente ve los clientes de sus agentes vinculados activos y mantiene sus permisos (solo contacto y dirección). Desactivar el vínculo o al agente quita el acceso en la siguiente petición. Lo administra quien tenga `user.manage`. |
| D9  | Orden de etapas          | La configuración aseguradoras × programas se **adelanta a la Etapa 5**, antes de registrar coberturas.                                                                                                                                                                                                               |
| D7  | SOA y consentimientos    | Las tablas se incluyen **desde el esquema inicial** (sin interfaz completa en v1) para no cambiar la base de datos después.                                                                                                                                                                                          |

## 2. Stack

| Capa                 | Tecnología                                      | Justificación                                                                               |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Framework            | Next.js (App Router) + TypeScript estricto      | Front + back en un proyecto; render en servidor                                             |
| BD                   | PostgreSQL (Docker en local)                    | Relacional, transaccional, índices parciales, búsqueda                                      |
| ORM                  | Prisma                                          | Esquema tipado, migraciones versionadas                                                     |
| Auth                 | Better Auth                                     | Sesiones en BD revocables, 2FA TOTP, rate limiting                                          |
| Validación           | Zod                                             | Mismo esquema en front y back                                                               |
| i18n                 | **next-intl**                                   | Integración nativa con App Router y Server Components; formato de fechas/números con `Intl` |
| UI                   | Tailwind CSS + shadcn/ui (Radix) + lucide-react | Accesible, consistente, código propio                                                       |
| Tablas / formularios | TanStack Table · React Hook Form                | Paginación en servidor; formularios por secciones                                           |
| Feedback / gráficas  | Sonner · Recharts                               | Toasts; gráficas del dashboard                                                              |
| Import/Export        | PapaParse · ExcelJS                             | CSV y .xlsx                                                                                 |
| Jobs (futuro)        | pg-boss                                         | Cola sobre PostgreSQL (recordatorios, correo, WhatsApp)                                     |
| Pruebas              | Vitest · Playwright                             | Unitarias/integración · E2E                                                                 |

Cada dependencia se justificará de nuevo al instalarla, con versión fijada.

## 3. Estructura de carpetas

```
docker-compose.yml          # PostgreSQL local
.env.example                # sin valores reales
src/
  app/[locale]/(auth)/login
  app/[locale]/(app)/dashboard | clients | clients/[id]/(overview|insurance|doctors|medications|notes|activity)
                    | reminders | import-export | settings/(carriers|programs|conditions|users|roles)
  i18n/                     # configuración next-intl
  messages/en.json · es.json
  modules/<dominio>/        # schema.ts · service.ts · repository.ts · actions.ts · components/
  lib/ auth · permissions · crypto · audit · db · logger (con filtro de PHI)
  components/ui/
prisma/ schema.prisma · migrations/ · seed.ts (solo datos ficticios)
docs/ ARCHITECTURE.md · adr/
tests/ unit · integration · e2e
```

## 4. Internacionalización (i18n)

- Rutas con prefijo de idioma: `/en/...` y `/es/...`. El selector cambia de idioma sin salir de la página.
- **En la BD se guardan códigos, no texto traducido** (`status = 'URGENT'`, `program = 'MEDICARE'`); la etiqueta visible sale del catálogo de mensajes.
- Los catálogos configurables (programas, condiciones crónicas, tipos de consentimiento) tienen `nameEn` y `nameEs`. Las aseguradoras usan su nombre comercial (no se traduce).
- Fechas, horas y números se formatean con `Intl` según el idioma (`11/18/2026` vs `18/11/2026`). Las fechas se guardan en UTC; las fechas de cobertura como `date` sin hora.
- Lo que escribe el usuario (notas, descripciones) **no se traduce**.
- **Idioma preferido del cliente** (`Client.preferredLanguage`: EN/ES/otro): se muestra en la tabla y el perfil, y queda listo para que las notificaciones futuras usen el idioma del cliente.
- Prueba automática: falla si falta una clave en alguno de los dos idiomas.

## 5. Modelo de datos

🔒 = cifrado a nivel de campo (AES-256-GCM) + `last4` para enmascarar + índice ciego (HMAC) para búsqueda exacta.

### Acceso

- `User` (name, email, roleId, isActive, preferredLocale, mfaEnabled, lastLoginAt)
- `Role`, `Permission`, `RolePermission` — roles y permisos en BD
- `AssistantAgentLink` (assistantId, agentId, isActive, createdById, deactivatedAt) — vínculo N:M asistente ↔ agente; único por par; no se borra, se desactiva
- `Session`, `Account`, `Verification` — librería de auth

### Catálogos configurables

- `CoverageProgram` (code, nameEn, nameEs, isActive) — Medicare, Medicaid, ACA
- `InsuranceCarrier` (name, isActive)
- `CarrierProgram` (carrierId, programId, isActive) — **administrado desde Configuración**, sin seed
- `ChronicCondition` (nameEn, nameEs, isActive)
- `ConsentType` (code, nameEn, nameEs, requiresDocument, defaultValidityDays nullable, isActive) — p. ej. SOA, contacto por teléfono/SMS/email/WhatsApp. **Los plazos de validez los define el usuario; no se asumen reglas de CMS.**
- `Doctor` (name, specialty, clinic, phone, address, npi?)
- `Medication` (name)

### Cliente

- `Client` — datos personales, domicilio, dirección postal + `mailingSameAsHome`, teléfonos, contacto alternativo + relación, email, `preferredLanguage`, `status` (NEW · PENDING · ACTIVE · URGENT), `assignedAgentId`, `createdById`, `createdAt`, `updatedAt`, `deletedAt`. Columnas derivadas mantenidas por triggers: `searchName` (búsqueda sin acentos) y `currentEffectiveDate` (orden y filtro por fecha efectiva)
- `ClientProgramEnrollment` (clientId, programId, beneficiaryNumber 🔒, partAStart?, partBStart?, notes) — único por (cliente, programa)
- `ClientCondition` (clientId, conditionId?, customName?, notes, createdAt) — `conditionId` del catálogo para filtrar; `customName` si no existe en el catálogo
- `ClientInsurance` (clientId, programId, carrierId, planName, memberNumber 🔒, confirmationNumber 🔒, applicationSubmittedAt, effectiveDate, endDate, status, isCurrent, changeReason, replacesInsuranceId, writingAgentId) — **historial sin sobrescritura**; validación: la aseguradora debe estar relacionada con el programa en `CarrierProgram`
- `ClientDoctor` (clientId, doctorId, role PCP|SPECIALIST, notes, isActive) — índice único parcial: 1 PCP activo
- `ClientMedication` (clientId, medicationId, dose, frequency, form, prescriberClientDoctorId?, notes, isActive)
- `Note` (clientId, authorId, body, isImportant, createdAt, updatedAt, deletedAt)
- `Reminder` (clientId, assignedToId, createdById, description, dueAt, priority, status, completedAt)

### Consentimientos y documentos (tablas en v1, interfaz completa después)

- `Document` (clientId, storageKey, fileName, mimeType, sizeBytes, sha256, uploadedById, createdAt, deletedAt) — archivos cifrados en almacenamiento privado
- `ClientConsent` (clientId, consentTypeId, status ACTIVE|EXPIRED|REVOKED, obtainedAt, method IN_PERSON|PHONE|ELECTRONIC|PAPER, expiresAt?, renewalDueAt?, appointmentAt? (SOA), scope JSON? (productos del SOA), documentId?, recordedById, revokedAt?, notes)

### Trazabilidad

- `ActivityLog` — historial de negocio por cliente (`{campo: {antes, después}}`; los campos sensibles solo registran "modificado"). **Solo inserción.**
- `AuditLog` — seguridad: logins, revelación de datos sensibles, búsquedas por identificador, exportaciones, importaciones, accesos. `dedupeKey` (único) evita duplicar eventos de consulta por el doble render de Next
- `ImportJob`, `ExportJob`

### Futuro sin cambios estructurales

`NotificationDelivery` (correo/WhatsApp), `CalendarSync`, `InsurancePlan`; renovaciones y productividad se calculan a partir de tablas existentes.

## 6. Seguridad (resumen)

Cifrado de identificadores · máscara `•••• 1234` + permiso para revelar (auditado) · alcance de datos por agente en cada consulta · Zod con listas cerradas de campos · 2FA, rate limiting, cookies seguras · inactividad 15 min / sesión máxima 12 h · logger sin PHI, sin analítica de terceros · CSP, sin `dangerouslySetInnerHTML` · neutralizar fórmulas en exportaciones · límites en importación · `.env` fuera de git · backups cifrados con prueba de restauración · solo datos ficticios en desarrollo · checklist de proveedores con BAA antes de producción.

## 7. Fase 2 — Diseño (aprobada)

Lienzo de diseño: https://claude.ai/artifact/3ZRgsmA5CoKWZVEZ8uiuHW (privado). Pantallas: sistema visual y mapa de navegación, login + 2FA, dashboard, tabla de clientes, perfil (6 pestañas), formulario por secciones, configuración aseguradoras × programas, perfil en celular.

Identidad: Inter; primario `#2346A8`; fondo `#F5F6F8`; estatus Nuevo (azul), Pendiente (ámbar), Activo (verde), Urgente (rojo + ícono). El color nunca es la única señal. Contraste mínimo 4.5:1.

## 8. Plan por etapas

0. Fundaciones (git, Next.js, Docker Compose, lint, i18n base, ADRs)
   — **Fase 2: Diseño (aprobación requerida)** —
1. ✅ Autenticación y roles
2. ✅ Esquema de BD + cifrado + seed ficticio
3. ✅ CRUD de clientes · ✅ Vínculos asistente ↔ agente (Configuración → Usuarios)
4. ✅ Búsqueda, filtros combinados, orden y estatus desde la tabla
5. ✅ Configuración de aseguradoras × programas (alta, edición, activar/desactivar y relaciones con Medicare/Medicaid/ACA) + Perfil con 6 pestañas + aseguranzas con historial
6. ✅ Médicos (directorio compartido, PCP único, especialistas) · 7. ✅ Medicamentos · 8. ✅ Notas + actividad · 9. ✅ Dashboard · 10. **En revisión:** Recordatorios (ADR 0015) · 11. Importar/exportar
7. Administración de usuarios (crear, roles, desactivar), condiciones crónicas y tipos de consentimiento
8. Endurecimiento, pruebas y checklist HIPAA
