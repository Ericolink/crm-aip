# ADR 0013 — Notas de seguimiento e historial de actividad

- **Estado:** propuesta para revisión (2026-11-19)

## Notas

- Cada nota es un **registro independiente** (autor, fecha de creación, fecha de modificación, marca de importante). Se muestran en **línea de tiempo**, de la más reciente a la más antigua; las importantes se destacan (punto ámbar, fondo y etiqueta) y hay un filtro "Solo importantes".
- **Nunca se pierde el texto:** editar guarda en `activity_logs` el texto anterior y el nuevo; quitar (borrado lógico) guarda el texto quitado. `activity_logs` es de solo inserción.
- **Permisos:** crear con `note.create` (Agente, Asistente, Administrador); editar/quitar **las propias** con `note.update_own`; **cualquiera** con `note.update_any` (Administrador). Leer: quien pueda ver al cliente.
- Texto obligatorio, máximo 5000 caracteres (también como regla en la base).
- El **Resumen** del perfil muestra la última nota importante.

## Historial de actividad

- Pestaña **Actividad**: línea de tiempo de solo lectura con quién, qué hizo, sobre qué, cuándo, y cada campo con su valor anterior y nuevo (etiquetas y valores traducidos; agentes por nombre; fechas y teléfonos con formato).
- Los números sensibles aparecen como **"modificado (valor oculto)"**.
- **Filtrado por permisos:** cada tipo de registro exige el permiso de su sección (cobertura → `insurance.read`; médicos, medicamentos y condiciones → `medical.read`). El Asistente no ve en el historial lo que no puede ver en el perfil, aunque pida esa categoría directamente.
- Filtros por categoría (Cliente, Aseguranzas, Médicos y medicamentos, Notas) y paginación hacia atrás con cursor estable (fecha + id); un cursor inválido se ignora.

## Nota de privacidad

El historial de notas guarda el texto de las notas editadas o quitadas. Es la misma información que ya ve quien puede leer las notas del cliente; no se expone a otros roles.

## Pruebas

- Integración (12): notas independientes y orden, importantes y resumen, validaciones, permisos propios vs. de cualquiera, texto anterior preservado al editar y al quitar, acceso de otro agente; historial completo para el agente, filtrado para el asistente (incluso pidiendo la categoría), filtro por categoría, paginación sin repetidos y cursor manipulado.
- Humo en servidor de producción: notas, filtro, resumen, actividad con etiquetas traducidas y valores ocultos, categorías, parámetros inválidos, inglés.
- **No verificado en navegador real:** la interacción de crear/editar/quitar notas. La lógica está cubierta por las pruebas de integración.
