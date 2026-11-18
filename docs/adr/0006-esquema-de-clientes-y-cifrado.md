# ADR 0006 — Esquema de clientes, cifrado de identificadores y datos de demostración

- **Estado:** aceptada (2026-11-18)

## Esquema

- Esquema de Prisma dividido por dominio en `prisma/schema/`: `base.prisma` (usuarios, auth, auditoría), `catalogs.prisma`, `clients.prisma`, `tracking.prisma`.
- **Datos del beneficiario separados de la póliza:** número de Medicare/Medicaid y fechas de Partes A/B viven en `ClientProgramEnrollment`; número de miembro, confirmación y fechas de la póliza en `ClientInsurance`. Cambiar de aseguradora no toca los datos del beneficiario.
- **Historial de aseguranzas:** un cambio cierra la cobertura anterior (`endDate`, `isCurrent=false`, estado `ENDED`) y crea otra que apunta a la anterior (`replacesInsuranceId`).
- **Médicos y medicamentos** como catálogos compartidos (`Doctor`, `Medication`) vinculados al cliente con `ClientDoctor` / `ClientMedication`.
- **Borrado lógico** (`deletedAt`) en todo el dominio de clientes; claves foráneas `Restrict` (nunca borrado en cascada de información de clientes).
- Tablas de **SOA/consentimientos** y **documentos** creadas desde ya (interfaz en etapas posteriores).
- `CarrierProgram` (aseguradora ↔ programa) se crea **vacía**: se configura desde la interfaz.

## Reglas que hace cumplir la base de datos

| Regla                                                                | Mecanismo                        |
| -------------------------------------------------------------------- | -------------------------------- |
| Un solo PCP activo por cliente                                       | Índice único parcial             |
| Una sola cobertura actual por cliente y programa                     | Índice único parcial             |
| Un programa activo por cliente (sin duplicados)                      | Índice único parcial             |
| Sin condición crónica duplicada / sin médico duplicado               | Índices únicos parciales         |
| Teléfonos de 10 dígitos; nombres no vacíos                           | CHECK                            |
| Valor cifrado, índice ciego y últimos 4 siempre juntos               | CHECK                            |
| Fecha fin ≥ fecha efectiva; una cobertura no se reemplaza a sí misma | CHECK                            |
| `activity_logs` y `audit_logs` de solo inserción                     | Trigger (UPDATE/DELETE/TRUNCATE) |

Búsqueda: extensión `pg_trgm` con índices GIN en nombre, apellido y correo del cliente, y nombre de médicos y medicamentos (coincidencias parciales con `ILIKE`).

## Cifrado de identificadores sensibles

- Campos: número de beneficiario (Medicare/Medicaid), número de miembro, número de confirmación.
- **AES-256-GCM** con IV aleatorio; el nombre del campo va como AAD (un valor cifrado no se puede mover a otra columna). Formato versionado `v1.<iv>.<tag>.<cifrado>` para permitir rotar la llave.
- **Índice ciego** HMAC-SHA256 con una llave distinta y el nombre del campo como contexto: búsqueda **exacta** sin descifrar. No permite búsquedas parciales (a propósito).
- Valores normalizados (mayúsculas, sin espacios ni guiones) antes de cifrar e indexar.
- Llaves en `.env`: `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY` (32 bytes, base64, distintas entre sí). **Si se pierde la llave de cifrado, los datos no se recuperan**: debe respaldarse en un gestor de contraseñas, separada de los backups de la base. En producción irán en un gestor de secretos/KMS.
- **No** se cifran a nivel de campo: fecha de nacimiento, dirección, teléfonos, notas (se necesitan para buscar, ordenar y leer). Quedan protegidos por el cifrado en reposo de la base, el control de acceso y la auditoría.

## Errores de base de datos

PostgreSQL incluye **la fila completa** en el detalle de los errores de restricciones (p. ej. nombre, fecha de nacimiento, teléfono). Por eso:

- Prisma ya no imprime errores en consola (`log: ["warn"]`).
- Todo error de base se traduce con `toSafeDbError()` / `describeDbErrorForLog()` (`src/lib/db-errors.ts`): solo tipo y nombre de la regla.
- **Pendiente para producción:** configurar los logs del servidor PostgreSQL gestionado para no registrar `DETAIL` ni parámetros (`log_error_verbosity = terse`, `log_parameter_max_length_on_error = 0`).

## Historial de actividad

- `recordActivity()` escribe en la **misma transacción** que el cambio.
- `diffChanges()` compara solo una lista cerrada de campos; los sensibles se registran como `{ changed: true }`, nunca con valores.

## Datos de demostración

- `npm run db:seed:demo`: 60 clientes ficticios con programas, coberturas (con historial), condiciones, médicos, medicamentos, notas, recordatorios e historial.
- Solo contra base local, nunca en producción, y solo si no hay clientes.
- Identificadores inválidos a propósito (MBI empieza con `0`, prefijos `DEMO`, teléfonos `555-01xx`, correos `@example.com`) para que nunca coincidan con datos reales.
- Las coberturas de demostración usan las 5 aseguradoras **sin** crear relaciones aseguradora↔programa.
