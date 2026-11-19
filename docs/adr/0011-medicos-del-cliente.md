# ADR 0011 — Médicos del cliente

- **Estado:** propuesta para revisión (2026-11-19)

## Decisión

- **Directorio compartido** (`doctors`): un médico se registra una vez y se vincula a muchos clientes (`client_doctors`) con su **tipo** (PCP / especialista) y **notas propias de cada cliente**.
- **Agregar:** buscar en el directorio (nombre, especialidad o clínica; sin acentos) o crear un médico nuevo. Vincular el mismo médico dos veces al mismo cliente se rechaza.
- **Un solo PCP activo** (índice único en la base). Asignar un PCP nuevo —al agregar o al cambiar el tipo— convierte al PCP anterior en **especialista** en la misma transacción; la interfaz lo avisa antes de guardar. No se pierde ningún médico.
- **Editar:** los datos del médico (nombre, especialidad, clínica, teléfono, dirección, NPI) son del directorio y se ven en todos sus clientes; si el médico es compartido, el formulario lo advierte con el número de clientes. Tipo y notas son solo de ese cliente.
- **Quitar:** borrado lógico del vínculo; el médico sigue en el directorio y el cambio queda en el historial. Se puede volver a agregar.
- El PCP aparece en el **Resumen** del perfil con enlace a la pestaña Médicos.
- **Permisos:** ver con `medical.read`; agregar/editar/quitar con `medical.write` (Agente y Administrador). El Asistente no ve la pestaña. Siempre dentro de la visibilidad del cliente.

## Reglas en la base

- `doctors_phone_digits` y `doctors_npi_digits` (10 dígitos), `doctors_name_not_blank`.
- `doctors.searchText` (nombre + especialidad + clínica, minúsculas y sin acentos) mantenido por **trigger**, con índice trigram. Se detectó en las pruebas que la búsqueda inicial no ignoraba acentos ("mendez" no encontraba "Méndez") y se corrigió con este mecanismo, igual que en clientes.

## Historial

Cada alta, cambio (incluida la conversión automática de PCP a especialista) y baja queda en `activity_logs` del cliente (`entityType = "doctor"`).

## Pruebas

- Integración (11): permisos, alta con directorio, reutilización entre clientes, duplicados, reemplazo de PCP, validaciones y NPI repetido, edición compartida vs. por cliente, cambio de tipo, sin cambios = sin historial, borrado lógico y re-alta, acceso de otro agente.
- Humo en servidor de producción: pestaña, PCP destacado, especialistas, resumen enlazado, idioma, estados vacíos, cliente inexistente.
- **No verificado en navegador real:** la interacción de los diálogos (búsqueda en vivo, alta, edición, quitar). La lógica está cubierta por las pruebas de integración.
