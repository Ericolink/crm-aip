# ADR 0016 — Importar y exportar clientes

- **Estado:** aprobada (2026-11-19)

## Decisiones del usuario

| Tema                                  | Decisión                                                       |
| ------------------------------------- | -------------------------------------------------------------- |
| Librerías                             | Ligeras y mantenidas (no ExcelJS)                              |
| Qué se importa                        | Solo datos personales y de contacto, estatus y agente asignado |
| Duplicados                            | Se omiten y se reportan                                        |
| Identificadores completos al exportar | Solo el administrador, con confirmación explícita, auditado    |

## Dependencias nuevas (versiones fijas, con más de 2 semanas de publicadas)

| Paquete            | Versión | Para qué                | Por qué                                                                      |
| ------------------ | ------- | ----------------------- | ---------------------------------------------------------------------------- |
| `papaparse`        | 5.7.0   | Leer y escribir CSV     | Maneja comillas, comas y saltos de línea dentro de celdas; sin dependencias. |
| `read-excel-file`  | 9.3.14  | Leer .xlsx              | Mantenido; solo depende de `fflate` (descompresión) y un lector XML.         |
| `write-excel-file` | 4.1.1   | Escribir .xlsx          | Mismo autor; solo depende de `fflate`.                                       |
| `@types/papaparse` | 5.5.2   | Tipos (solo desarrollo) |                                                                              |

Se descartó **ExcelJS** (plan original): su última versión es de 2023 y trae dependencias viejas (archiver, unzipper, tmp). También `xlsx` (SheetJS) de npm: versión 0.18.5 con vulnerabilidades conocidas. `npm audit`: 0 vulnerabilidades.

## Importación

- Pantalla **Importar / Exportar** → descargar plantilla (CSV o Excel, encabezados en el idioma de la interfaz) → subir archivo → **Revisar** (no guarda nada) → **Importar N clientes**.
- El navegador conserva el archivo y lo reenvía al confirmar; **el servidor nunca lo guarda** (ni en disco ni en la base). Se vuelve a validar completo al confirmar.
- Encabezados en español o inglés, sin importar mayúsculas, acentos ni espacios. Columnas desconocidas se ignoran y se informan. Obligatorias: Nombre y Apellido.
- Valores: estatus, idioma y relación por código o etiqueta en cualquiera de los dos idiomas; fechas `MM/DD/AAAA` o `AAAA-MM-DD` (o fecha de Excel); teléfonos con o sin `+1`; ZIP numérico de Excel recupera el cero inicial.
- Cada fila pasa por el **mismo esquema y servicio** que el formulario (`clientFormSchema` + `createClient`): mismas validaciones, historial "creó el cliente" y permisos.
- **Agente asignado** por correo, solo con `client.assign`; si no, el cliente queda asignado a quien importa.
- **Duplicados**: mismo nombre (sin acentos ni mayúsculas) + fecha de nacimiento; si la fila no tiene fecha, nombre + teléfono. Se comparan con todos los clientes no eliminados y dentro del mismo archivo. Se omiten y se reportan sin decir a qué cliente coinciden.
- Errores por fila: **solo número de fila, columna y código**, nunca el valor de la celda.
- Límites: 2 MB, 2,000 filas, 60 columnas, 500 caracteres por celda. `.xlsx` se valida por contenido (firma ZIP) y se revisa el tamaño descomprimido declarado (protección básica contra "bombas ZIP"). Límite de las Server Actions: 3 MB.
- Registro: `import_jobs` (archivo, filas, importadas, errores sin valores) + auditoría `DATA_IMPORTED`.

## Exportación

- Botón **Exportar** en la lista de clientes (exporta con los filtros y el orden aplicados) y en Importar / Exportar (todos los visibles). Formato Excel o CSV. Máximo 10,000 filas.
- Misma visibilidad que la lista. Columnas: datos de la plantilla de importación (el archivo se puede volver a importar) + agente, fecha de alta y, con `insurance.read`, programas, aseguradora, plan, estatus y fecha efectiva de la cobertura actual.
- Identificadores (Medicare, Medicaid, nº de miembro) **enmascarados** `•••• 1234` por defecto. Completos solo con el nuevo permiso **`data.export_sensitive`** (solo Administrador) + `client.sensitive.reveal`, marcando la casilla y confirmando una advertencia. No se exportan datos médicos (condiciones, médicos, medicamentos): mínimo necesario.
- **Inyección de fórmulas**: en CSV se antepone `'` a textos que empiezan con `= + - @`; en Excel todas las celdas se escriben como texto.
- CSV en UTF-8 con BOM (acentos correctos al abrir en Excel).
- El archivo se genera en memoria y se entrega directo al navegador; no queda copia en el servidor.
- Registro: `export_jobs` (formato, filtros **sin el texto buscado**, columnas, filas, si incluyó identificadores completos) + auditoría `DATA_EXPORTED`. La pantalla muestra las exportaciones recientes y marca en rojo las que incluyeron identificadores.

## Acción requerida tras actualizar

El permiso `data.export_sensitive` se crea con el seed: ejecutar `npm run db:seed` en la base de desarrollo para que el administrador lo reciba (el seed es idempotente).

## Pruebas

- Unitarias (10): encabezados, valores, fórmulas, CSV y XLSX de ida y vuelta, formatos rechazados, límites.
- Integración (9): vista previa sin guardar, errores por fila sin valores, duplicados (existentes y en el archivo), importación con historial, trabajo y auditoría, reimportación sin duplicar, XLSX en inglés, permisos; exportación con filtros, enmascarado, identificadores completos solo con permiso, lo exportado se puede reimportar.
- Humo en servidor de producción (9): página, secciones, menú, botón en la lista, inglés.
