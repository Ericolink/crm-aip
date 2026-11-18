# ADR 0002 — Base de datos local con Docker

- **Estado:** aceptada (2026-11-18)

## Decisión

- PostgreSQL **18.7 (imagen `postgres:18.7-alpine`)** en Docker Compose, servicio `db`.
- Puerto publicado solo en `127.0.0.1` (no accesible desde la red local).
- Autenticación `scram-sha-256`. Credenciales en `.env` (nunca versionado); plantilla en `.env.example`.
- Datos en el volumen `crm_pgdata`. `npm run db:reset` borra el volumen.
- Solo datos ficticios en desarrollo.

## Consecuencias

Entorno reproducible en cualquier máquina con Docker Desktop. Producción usará una base gestionada de un proveedor que firme BAA (por decidir), con cifrado en reposo, backups y PITR.
