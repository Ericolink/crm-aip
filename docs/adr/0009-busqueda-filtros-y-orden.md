# ADR 0009 — Búsqueda, filtros combinados, orden y estatus en la tabla

- **Estado:** propuesta para revisión (2026-11-18)

## Decisión

### Estado en la URL

Búsqueda, filtros, orden y página viven en la URL (`/clients?q=…&status=NEW,URGENT&program=MEDICARE&sort=effective_asc&page=2`): se pueden compartir, guardar como favorito y funcionan con el botón "atrás". `parseClientListParams` valida cada parámetro con Zod; cualquier valor inválido se **ignora** (no rompe la pantalla).

### Búsqueda

| Qué se escribe                                     | Cómo se busca                                                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombre / apellido (cualquier orden)                | Cada palabra debe aparecer en `searchName` (minúsculas, **sin acentos**). Índice trigram (GIN).                                                                |
| Correo                                             | Contiene (sin distinguir mayúsculas).                                                                                                                          |
| Teléfono (con o sin formato)                       | Dígitos contenidos en teléfono principal o alternativo (≥ 3 dígitos).                                                                                          |
| Nº de miembro / confirmación / Medicare / Medicaid | **Coincidencia exacta** por índice ciego. Solo para quien puede revelar números (`client.sensitive.reveal`). Se audita (`IDENTIFIER_SEARCH`) **sin el valor**. |

- `searchName` la mantiene un **trigger** de PostgreSQL (`unaccent`), así ningún camino de escritura la deja desactualizada.
- Los comodines de SQL (`%`, `_`) se eliminan del texto buscado. Una búsqueda sin términos válidos no devuelve nada (nunca "todo").

### Filtros (combinables)

Estatus (uno o varios), programa, aseguradora actual, agente, condición crónica, rango de creación (días en hora de Florida, con horario de verano) y rango de fecha efectiva. La **visibilidad por usuario es siempre la primera condición**; filtrar por un agente que el usuario no puede ver devuelve vacío (nunca amplía el acceso). El filtro de agente solo aparece para quien ve todos los clientes o tiene agentes vinculados.

Las pastillas de estatus muestran el conteo **con los demás filtros aplicados**.

### Orden

Más recientes / más antiguos, fecha efectiva (próxima primero o más lejana primero; sin fecha al final) y apellido A–Z. Los encabezados "Cliente", "Fecha efectiva" y "Creado" son ordenables (con `aria-sort`).

`clients.currentEffectiveDate` = fecha efectiva más próxima de las coberturas actuales; la mantiene un **trigger** sobre `client_insurances` (alta, cambio, baja).

### Estatus desde la tabla

Menú en cada fila para quien tiene edición completa (`client.update`): se ve al instante, y si el servidor lo rechaza vuelve al valor anterior y avisa. Cada cambio queda en el historial; elegir el mismo estatus no genera registro. El asistente ve la etiqueta sin menú.

### Buscador general

En la barra superior (Ctrl/⌘ + K). Envía a la lista de clientes con la búsqueda aplicada.

## Hallazgo: doble render y auditoría

Se midió que **Next 16 con Cache Components ejecuta la página dos veces por petición HTML** (≈ 25 ms de diferencia). Cualquier efecto durante el render se duplicaba (p. ej. `CLIENT_VIEWED`).

Solución: los eventos de **consulta** (`CLIENT_VIEWED`, `IDENTIFIER_SEARCH`) llevan una clave de deduplicación con **índice único** en `audit_logs.dedupeKey` (`INSERT … ON CONFLICT DO NOTHING`, sin condiciones de carrera). La clave combina usuario, acción, objetivo, un hash de los metadatos y, para búsquedas, el índice ciego (con llave) de lo buscado, de modo que búsquedas distintas nunca se fusionan y el valor no se puede deducir. Ventana: 10 s. Las **acciones** del usuario (revelar, iniciar sesión, cambiar datos) nunca se deduplican.

## Pruebas

- Unitarias: parámetros de URL, normalización, teléfono/identificador, horario de Florida, construcción de la consulta, orden.
- Integración: búsqueda (acentos, orden de palabras, teléfono, correo, identificadores con y sin permiso, sin fugas entre agentes, cambio de nombre), filtros solos y combinados, conteos, orden y recálculo de fecha efectiva, cambio de estatus y permisos, auditoría sin duplicados (incluso en paralelo).

## Pendiente / notas

- Next envía al navegador el catálogo completo de textos de la interfaz (no contiene datos de clientes). Se puede limitar por pantalla más adelante si afecta el rendimiento.
