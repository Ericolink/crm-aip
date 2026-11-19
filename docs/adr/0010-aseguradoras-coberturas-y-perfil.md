# ADR 0010 — Aseguradoras, coberturas con historial y perfil con pestañas

- **Estado:** propuesta para revisión (2026-11-18)

## 1. Corrección de privacidad (Etapas 3–4)

Al preparar la pestaña de aseguranzas se detectó que el **Asistente** recibía datos que su rol no permite ver:

| Dónde                              | Qué se filtraba                                                                              | Corrección                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Detalle del cliente                | Programas, últimos 4 del número de beneficiario, cobertura actual, condiciones crónicas, PCP | Programas y coberturas solo con `insurance.read`; condiciones y PCP solo con `medical.read`. Sin permiso **no se envían**. |
| Formulario de edición (rol básico) | Programas, condiciones y últimos 4 viajaban ocultos al navegador                             | Se envían vacíos; el servidor ya los ignoraba al guardar.                                                                  |
| Lista de clientes                  | Programas, aseguradora actual, fecha efectiva                                                | Columnas vacías y ocultas sin `insurance.read`.                                                                            |
| Filtros y orden                    | Filtrar por condición/programa/aseguradora permitía deducir datos de salud                   | Se ignoran sin el permiso correspondiente; el orden por fecha efectiva vuelve al orden por defecto.                        |

Cubierto por `tests/integration/assistant-privacy.test.ts`.

## 2. Configuración de aseguradoras × programas

- **Configuración → Aseguradoras y programas** (`settings.manage`): agregar, renombrar, activar/desactivar aseguradoras y activar/desactivar su relación con Medicare, Medicaid y ACA (interruptores accesibles, `role="switch"`).
- No se asume ninguna relación; se pueden crear aseguradoras exclusivas de ACA.
- Desactivar una aseguradora o una relación **no borra** coberturas: solo deja de ofrecerse para nuevos registros.
- Cada cambio se registra en auditoría (`CARRIER_CREATED`, `CARRIER_UPDATED`, `CARRIER_PROGRAM_CHANGED`).

## 3. Coberturas con historial

| Operación                            | Regla                                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registrar                            | El cliente debe tener el programa registrado; la aseguradora debe estar activa y ofrecer ese programa (relación activa); una sola cobertura actual por programa.                                     |
| Editar                               | Solo la cobertura **actual** (plan, estado pendiente/activa, fechas, números). Número vacío = se conserva.                                                                                           |
| Cambiar aseguradora                  | Cierra la actual (`ENDED`, `isCurrent=false`, fecha de fin = día anterior a la nueva fecha efectiva o la indicada) y crea una nueva enlazada (`replacesInsuranceId`) con el motivo. Una transacción. |
| Terminar                             | Finalizada (requiere fecha), cancelada o denegada. Queda en el historial.                                                                                                                            |
| Historial                            | De solo lectura.                                                                                                                                                                                     |
| Revelar nº de miembro / confirmación | `client.sensitive.reveal`, auditado, se oculta a los 30 s.                                                                                                                                           |

- Fecha de fin anterior a la efectiva: la rechaza la base (CHECK) y se muestra como error del campo.
- Todo cambio deja registro en `activity_logs` (los números solo como "modificado"). La fecha efectiva del cliente se recalcula por trigger.
- `writingAgentId` = agente asignado al cliente (o quien registra).

## 4. Perfil con 6 pestañas

- Rutas: `/clients/[id]` (Resumen), `/insurance`, `/doctors`, `/medications`, `/notes`, `/activity`. Cabecera y pestañas en un layout compartido (`clients/[id]/(profile)`); cada pestaña se puede enlazar y funciona con "atrás". "Editar cliente" sigue fuera, a pantalla completa.
- Solo se muestran las pestañas que el rol permite (Aseguranzas: `insurance.read`; Médicos y Medicamentos: `medical.read`). Abrir la URL directamente sin permiso muestra "sin permiso".
- Estatus editable desde la cabecera del perfil.
- Médicos, Medicamentos, Notas y Actividad: estructura lista; contenido en las Etapas 6–8.

## 5. Notas técnicas

- `src/lib/action-result.ts`: resultado uniforme de Server Actions y traducción segura de errores (reutilizable por los módulos siguientes).
- Componente `Modal` sobre `<dialog>` nativo.
- **Cliente inexistente:** con streaming, Next envía primero el marco de la app y después la señal `NEXT_HTTP_ERROR_FALLBACK;404`; el navegador muestra "no encontrado". El código HTTP queda en 200 (los encabezados ya se enviaron). No se filtra ningún dato.

## Pruebas

- Integración: 16 de aseguradoras y coberturas + 6 de privacidad (75 en total en la suite).
- Humo en servidor de producción: configuración de aseguradoras, perfil, pestañas, historial, idiomas.
- **No verificado aún en navegador real:** la interacción de los diálogos (abrir, enviar, cerrar). La lógica de cada acción está cubierta por las pruebas de integración del servicio. Las pruebas de interfaz en navegador (Playwright) están previstas en la fase de pruebas.
