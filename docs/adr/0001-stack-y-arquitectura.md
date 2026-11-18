# ADR 0001 — Stack y arquitectura: monolito modular con Next.js

- **Estado:** aceptada (2026-11-18)

## Contexto

CRM privado para un agente independiente, con información médica y personal sensible. Debe ser fácil de mantener por un equipo pequeño y poder crecer a varios agentes.

## Decisión

- Monolito modular en **Next.js 16.4 (App Router) + React 19.3 + TypeScript 5.9 estricto**.
- Código organizado por dominio en `src/modules/<dominio>` (schema · service · repository · actions · components).
- Ninguna pantalla accede a la base de datos directamente: todo pasa por servicios que validan (Zod), autorizan y registran actividad.
- Versiones **fijadas exactamente** en `package.json` (sin `^`).

## Notas de versión

- **TypeScript 5.9.3** en lugar de 7.x: es la versión que pide la plantilla oficial de Next 16.4. TS 7 (compilador nativo) se evaluará cuando Next lo soporte oficialmente.
- **ESLint 9.39.5**: `eslint-config-next` 16.4.6 se publica para ESLint 9. npm avisa que la rama 9 ya no recibe soporte; se migrará a ESLint 10 cuando la configuración de Next lo soporte oficialmente.
- `next-intl` trae `@swc/core` y `@parcel/watcher` (para su extractor de mensajes) con scripts de instalación que npm 11 no ejecuta por defecto. No usamos el extractor, así que no se aprueban.

## Consecuencias

Un solo despliegue y un solo repositorio. Si un módulo necesitara escalar por separado, ya está aislado detrás de su capa de servicios.
