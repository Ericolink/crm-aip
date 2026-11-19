# Checklist HIPAA: controles del sistema y pendientes

> **Aviso:** este documento NO certifica ni afirma que el sistema sea "HIPAA compliant". Resume qué controles técnicos existen hoy en el código y qué falta (infraestructura, proveedores, contratos, políticas y procedimientos). El cumplimiento solo podrá afirmarse cuando todo lo anterior sea **revisado y validado formalmente** por quien corresponda.
>
> Estado al 2026-11-19 (Etapa 13). Hasta cerrar los pendientes marcados como **bloqueantes**, el sistema se usa **solo con datos ficticios y solo en local**.

Leyenda: ✅ implementado en el código y probado · 🟡 parcial · ⬜ pendiente (fuera del código o por decidir) · 🔒 **bloqueante antes de usar datos reales**

## 1. Salvaguardas técnicas (45 CFR 164.312)

| Requisito                            | Estado | Cómo se cumple hoy / qué falta                                                                                                                                                                                                                      |
| ------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identificación única de usuario      | ✅     | Cada persona tiene su cuenta. No hay registro público; las cuentas las crea el administrador. No se borran (trazabilidad), se desactivan.                                                                                                           |
| Autenticación                        | ✅     | Contraseña de 12+ caracteres (hash scrypt) y 2FA TOTP **obligatoria** con códigos de respaldo. Límite de intentos y bloqueo de la 2FA. Contraseña puesta por el admin → cambio obligatorio al entrar.                                               |
| Control de acceso (mínimo necesario) | ✅     | Roles con permisos en base de datos. Cada consulta filtra por agente asignado / asistente vinculado. El Asistente no ve información médica. Los identificadores van enmascarados y revelarlos exige permiso y queda auditado.                       |
| Cierre automático de sesión          | ✅     | 15 min de inactividad (con aviso) y 12 h máximo. Desactivar un usuario o restablecer su contraseña/2FA cierra sus sesiones al instante.                                                                                                             |
| Acceso de emergencia                 | ⬜     | Definir procedimiento si el único administrador no está disponible (p. ej. segundo administrador, credenciales selladas).                                                                                                                           |
| Cifrado de datos en reposo           | 🟡     | Medicare, Medicaid, nº de miembro y confirmación cifrados por campo (AES-256-GCM) con índice ciego. Respaldos cifrados (AES-256-GCM). 🔒 Falta cifrado del disco/base del proveedor de producción.                                                  |
| Controles de auditoría               | ✅     | Bitácora de seguridad de solo inserción (triggers impiden UPDATE/DELETE/TRUNCATE), sin PHI. Historial de cambios por cliente. **Visor de auditoría** para el administrador (consultarlo también se registra).                                       |
| Integridad                           | ✅     | Bitácoras inmutables en la base. Validación de entradas (Zod, listas cerradas). Respaldos con verificación de integridad (GCM) y prueba de restauración.                                                                                            |
| Seguridad en la transmisión          | 🟡     | En el código: HSTS, cookies `Secure`/`HttpOnly`/`SameSite`, `upgrade-insecure-requests`. 🔒 Falta TLS (HTTPS) en el hosting de producción.                                                                                                          |
| Protección contra código malicioso   | ✅     | CSP estricta con nonce por petición (los scripts inyectados no se ejecutan; probado en navegador real). Sin `dangerouslySetInnerHTML`. Fórmulas neutralizadas al exportar. Archivos importados: validados por contenido y tamaño, nunca se guardan. |

## 2. Salvaguardas administrativas (164.308)

| Requisito                                      | Estado | Notas                                                                                                                                                                                                                     |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Análisis y gestión de riesgos                  | ⬜ 🔒  | Hacer y documentar el análisis de riesgos (amenazas, probabilidad, impacto) del sistema ya desplegado y del entorno de trabajo.                                                                                           |
| Responsable de seguridad / privacidad          | ⬜ 🔒  | Designar formalmente a la persona responsable (decisión del negocio).                                                                                                                                                     |
| Gestión de accesos del personal                | 🟡     | En el sistema: alta, roles, desactivación con reasignación, restablecimientos, todo auditado. Falta el procedimiento escrito (quién autoriza altas, revisión periódica de accesos, baja al terminar la relación laboral). |
| Capacitación del personal                      | ⬜     | Capacitación en seguridad y privacidad para cada usuario antes de darle acceso; registrar fecha.                                                                                                                          |
| Procedimiento de incidentes de seguridad       | ⬜ 🔒  | Cómo detectar, reportar, contener y documentar incidentes. El visor de auditoría ayuda a investigar (accesos denegados, revelaciones, exportaciones).                                                                     |
| Plan de contingencia (respaldo y recuperación) | 🟡     | Local: `npm run db:backup` y `npm run db:restore-test`. 🔒 En producción: respaldos automáticos del proveedor, copia fuera del sitio, prueba de restauración periódica documentada, plan de recuperación ante desastres.  |
| Evaluación periódica                           | ⬜     | Revisar estos controles al menos una vez al año o ante cambios importantes. `npm audit` y pruebas en cada cambio.                                                                                                         |
| Contratos con socios de negocio (BAA)          | ⬜ 🔒  | **BAA firmado** con cada proveedor que almacene, procese o transmita PHI: hosting, base de datos, respaldos, correo (si se agrega), monitoreo/logs. Sin BAA, no se usa el proveedor.                                      |

## 3. Salvaguardas físicas (164.310)

| Requisito                       | Estado | Notas                                                                                                                                                                                                   |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instalaciones del servidor      | ⬜ 🔒  | Las cubre el proveedor de hosting con BAA (centros de datos con controles físicos).                                                                                                                     |
| Equipos de trabajo (estaciones) | ⬜     | Política para las computadoras y teléfonos del personal: bloqueo de pantalla, disco cifrado, sistema actualizado, sin cuentas compartidas.                                                              |
| Archivos exportados             | 🟡     | El sistema advierte al exportar, enmascara identificadores por defecto y audita cada exportación. Falta la política: dónde se guardan, cómo se envían (nunca por correo sin cifrar) y cuándo se borran. |

## 4. Regla de privacidad y otros

| Tema                                         | Estado | Notas                                                                                                                                      |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Mínimo necesario                             | ✅     | Roles, alcance por agente, enmascarado, exportación sin datos médicos.                                                                     |
| Solicitudes del cliente (acceso, corrección) | ⬜     | Procedimiento para atenderlas. El sistema permite consultar y corregir los datos, con historial.                                           |
| Retención de documentación (6 años)          | ⬜     | Definir retención de bitácoras, respaldos y documentación de políticas. Hoy nada se borra automáticamente.                                 |
| Notificación de brechas                      | ⬜ 🔒  | Procedimiento y plazos de notificación (clientes, HHS y, según el caso, medios). Revisar también leyes estatales (p. ej. Florida).         |
| Consentimientos (SOA, contacto)              | 🟡     | Catálogo configurable listo; el registro por cliente llega en una etapa posterior. Las reglas de CMS las define el negocio, no el sistema. |

## 5. Antes de cargar el primer dato real (resumen de bloqueantes 🔒)

1. Proveedor de hosting y base de datos con **BAA firmado**, cifrado en reposo y **HTTPS**.
2. Respaldos automáticos cifrados en producción, fuera del sitio, con **prueba de restauración** documentada.
3. Llaves (`BETTER_AUTH_SECRET`, `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `BACKUP_ENCRYPTION_KEY`) generadas para producción, guardadas en un gestor de secretos, **separadas** de los respaldos.
4. Análisis de riesgos documentado y responsable de seguridad designado.
5. Procedimientos escritos: incidentes, notificación de brechas, altas/bajas de personal.
6. Revisión formal de todo lo anterior por quien corresponda (legal / cumplimiento).

## 6. Limitaciones técnicas conocidas

- **Estilos en línea permitidos** en la CSP (`style-src 'unsafe-inline'`), necesario para la librería de avisos. Los scripts sí son estrictos. Riesgo bajo: un estilo no ejecuta código.
- **Sin alertas automáticas:** la bitácora se revisa manualmente en el visor. Para producción, evaluar alertas (p. ej. muchos inicios fallidos, exportaciones con identificadores) con un servicio con BAA.
- **Límite de intentos** guardado en la base; detrás de un proxy hay que configurar la IP de confianza (`x-forwarded-for`).
- **Dependencias:** `npm audit` en 0 vulnerabilidades (con un `override` documentado de `effect` en la CLI de Prisma). Revisar en cada actualización.
