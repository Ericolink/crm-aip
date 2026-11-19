# ADR 0014 — Panel principal (Dashboard)

- **Estado:** propuesta para revisión (2026-11-19)

## Contenido

| Bloque                    | Detalle                                                                                                                                           | Permiso          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Indicadores               | Total de prospectos (+ altas de la semana), Nuevos, Pendientes, Activos, Urgentes (+ seguimientos vencidos). Cada tarjeta abre la lista filtrada. | `client.read`    |
| Clientes por programa     | Medicare, Medicaid, ACA con barras (HTML/CSS). Un cliente puede contar en varios programas.                                                       | `insurance.read` |
| Próximos seguimientos     | Recordatorios pendientes, vencidos primero, con prioridad y botón para llamar (`tel:`).                                                           | `client.read`    |
| Próximas fechas efectivas | Coberturas actuales con fecha efectiva de hoy en adelante.                                                                                        | `insurance.read` |
| Solicitudes pendientes    | Coberturas en "solicitud pendiente", la más antigua primero, con días de espera (rojo > 14 días).                                                 | `insurance.read` |
| Agregados recientemente   | Últimos 5 clientes.                                                                                                                               | `client.read`    |
| Actividad reciente        | Últimos 8 cambios, filtrados por tipo de registro igual que el historial del cliente.                                                             | según tipo       |

## Reglas

- **Misma visibilidad que la lista** (agente: los suyos; asistente: los de sus agentes vinculados; administrador: todos). Clientes eliminados y recordatorios completados no cuentan.
- Sin `insurance.read`, los datos de cobertura **ni se consultan**.
- Se calcula **en cada visita** (sin caché): los indicadores reflejan cualquier alta o cambio inmediatamente.
- "Hoy" y "mañana" según la hora de Florida. La hora del cálculo la entrega el servicio (el render no lee el reloj).
- No se agregó Recharts: las barras simples se resuelven con HTML/CSS. Se evaluará para los reportes (etapa futura).
- La gestión de recordatorios (crear, completar, cancelar) llega en la **Etapa 10**; el panel ya los lista.

## Pruebas

- Integración (8): conteos por estatus y semana, programas, solicitudes y fechas efectivas, seguimientos (orden, vencidos, sin completados ni de eliminados), actividad, visibilidad por agente, asistente sin cobertura ni actividad médica, administrador.
- Humo en servidor de producción: cada indicador coincide con un conteo directo en la base, enlaces a la lista filtrada, actualización tras un cambio, inglés.
