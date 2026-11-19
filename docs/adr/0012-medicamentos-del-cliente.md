# ADR 0012 — Medicamentos del cliente

- **Estado:** propuesta para revisión (2026-11-19)

## Decisión

- Pestaña **Medicamentos** separada de las pólizas: varios medicamentos por cliente, cada uno con nombre, dosis, frecuencia, presentación, médico que lo prescribe (opcional) y notas.
- **Catálogo de nombres** (`medications`) compartido: al escribir se sugieren nombres existentes (`<datalist>` nativo, accesible) y se reutilizan **sin importar mayúsculas** ("metformin" = "Metformin"). La base lo garantiza con un índice único sobre `lower(name)`; el alta usa `INSERT … ON CONFLICT DO NOTHING` para no romper la transacción si dos personas lo crean a la vez.
- **Médico que prescribe:** solo puede elegirse entre los médicos **activos de ese mismo cliente**. Si después se quita al médico del cliente, el medicamento conserva quién lo prescribió (se muestra "ya no está en la lista de médicos") y puede editarse sin perder ese dato; no se puede asignar un médico quitado a un medicamento nuevo.
- **Presentación:** tableta, cápsula, líquido, inyección, inhalador, tópico, parche, gotas u "Otra" (requiere descripción; regla también en la base).
- **Quitar:** borrado lógico; queda en el historial.
- **Permisos:** ver con `medical.read`; agregar/editar/quitar con `medical.write`. El Asistente no ve la pestaña. Siempre dentro de la visibilidad del cliente.
- Cada alta, cambio y baja queda en `activity_logs` (`entityType = "medication"`) con antes y después; guardar sin cambios no genera registro.

## Pruebas

- Integración (11): permisos, alta completa, catálogo sin duplicados por mayúsculas (servicio y base), médico de otro cliente rechazado, validaciones, edición con historial, sin cambios = sin historial, médico quitado conservado, borrado lógico, acceso de otro agente.
- Humo en servidor de producción: tabla, datos de demostración, presentación traducida, acciones accesibles, inglés, estado vacío, cliente inexistente.
- **No verificado en navegador real:** la interacción del formulario (sugerencias, guardar, quitar). La lógica está cubierta por las pruebas de integración.
