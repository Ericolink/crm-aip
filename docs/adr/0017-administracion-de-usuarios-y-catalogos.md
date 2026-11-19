# ADR 0017: Administración de usuarios y catálogos

- **Estado:** propuesta para revisión (2026-11-19)

## Decisiones del usuario

| Tema                                   | Decisión                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Contraseña inicial                     | La escribe el administrador; el usuario debe cambiarla al entrar                        |
| "Roles" en esta etapa                  | Asignar rol a cada usuario. Los permisos de cada rol no se editan desde la interfaz     |
| Desactivar a quien tiene clientes      | Se reasignan a un agente activo al desactivar, con registro en el historial del cliente |
| Contraseña olvidada / teléfono perdido | El administrador puede restablecer la contraseña y reiniciar la 2FA                     |

Sin dependencias nuevas.

## Usuarios (Configuración → Usuarios, permiso `user.manage`)

- **Alta**: nombre, correo de acceso, rol (Administrador, Agente, Asistente), idioma y contraseña inicial (mínimo 12 caracteres). Se guarda solo el hash (scrypt, el mismo formato que usa Better Auth). La contraseña se entrega en persona, porque no hay un servicio de correo configurado.
- **Cambio obligatorio**: nueva columna `users.mustChangePassword` (migración `20261119213313_user_must_change_password`).
  - Mientras esté activa, `requireUser` envía al usuario a `/change-password` desde cualquier pantalla, incluida la de configurar la 2FA. El orden es: contraseña propia → 2FA → sistema.
  - La marca se limpia en el hook de Better Auth cuando `/change-password` responde con éxito.
  - Better Auth rechaza que la nueva contraseña sea igual a la actual (`PASSWORD_REUSED`), y el formulario también lo valida.
- **Edición**: nombre, correo de acceso, idioma y rol.
  - Nadie puede cambiar su propio rol.
  - Si el usuario deja de ser asistente, se desactivan sus vínculos con agentes, para que no conserve acceso a clientes ajenos.
  - Si pasa a ser asistente, se desactivan sus vínculos como agente. Si tiene clientes, hay que elegir a qué agente pasan.
  - Los cambios de rol tienen efecto en la siguiente petición, porque los permisos se cargan en cada petición.
- **Desactivar / reactivar**: los usuarios nunca se borran.
  - Desactivar cierra todas sus sesiones al instante.
  - Si tiene clientes (no eliminados) o recordatorios pendientes, hay que elegir un agente o administrador activo que los reciba. Cada cliente y recordatorio movido queda en su historial, en la misma transacción.
  - Al reactivar, los clientes no regresan automáticamente.
- **Restablecer contraseña**: el administrador escribe una contraseña temporal. Se cierran las sesiones del usuario y debe cambiarla al entrar.
- **Reiniciar 2FA**: se borran el secreto y los códigos de respaldo y se cierran las sesiones. El usuario la configura de nuevo al entrar (la 2FA sigue siendo obligatoria).
- **Protecciones**:
  - Nadie puede desactivarse, cambiarse el rol ni restablecerse a sí mismo desde esta pantalla; la contraseña propia se cambia en Mi cuenta.
  - Siempre queda al menos un administrador activo.
- **Auditoría**: `USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `USER_REACTIVATED`, `USER_PASSWORD_RESET`, `USER_2FA_RESET`.
  - Los metadatos solo guardan códigos y cantidades (rol anterior y nuevo, si cambió el nombre o el acceso, cuántos clientes se reasignaron).
  - Nunca guardan nombres, correos ni contraseñas.
- **Indicadores**: la tabla marca "Debe cambiar la contraseña", "2FA pendiente" y "(Tú)".

## Catálogos (permiso `settings.manage`)

- **Condiciones crónicas** (Configuración → Condiciones crónicas):
  - Se pueden agregar (nombre en español e inglés, sin repetir), editar, activar o desactivar y ordenar con subir/bajar. Este es el orden del formulario del cliente.
  - La tabla muestra cuántos clientes tienen cada condición.
  - Desactivar no quita la condición a los clientes que ya la tienen. Al editar a uno de esos clientes, la condición aparece marcada "inactiva en el catálogo" y se puede conservar o quitar, pero no se puede asignar a clientes nuevos.
  - Para esto se ajustaron `getClientFormOptions` y `syncConditions`. Antes, una condición desactivada habría hecho fallar la edición del cliente.
- **Tipos de consentimiento** (Configuración → Tipos de consentimiento):
  - Se pueden agregar, editar, activar o desactivar.
  - Cada tipo tiene "requiere documento firmado" y "vigencia por defecto en días" (vacío = no vence, máximo 3650). Ambos los define el usuario: no se asumen reglas de CMS.
  - El código se genera una vez a partir del nombre en inglés (`PHONE_CONTACT`), con sufijo si ya existe, y no cambia al renombrar.
  - El registro de consentimientos en el perfil del cliente queda para una etapa posterior. Esta pantalla lo indica.
- **Auditoría**: `CATALOG_ITEM_CREATED` y `CATALOG_ITEM_UPDATED`, con el tipo de catálogo y qué cambió (sin textos libres).
- Nada se borra: se desactiva.

## Otros cambios

- `Alert` tiene un nuevo tono `warning` (ámbar, con ícono).
- El menú de Configuración ya no tiene secciones "Pronto".
- `requireSettingsManager` (aseguradoras) se exporta y se reutiliza en catálogos.

## Pruebas

- **Unitarias (6)**:
  - Validación del alta (correo normalizado, contraseña corta, rol desconocido, nombre con símbolos).
  - La edición no lleva contraseña.
  - Error `PASSWORD_REUSED`.
  - Código y vigencia de los tipos de consentimiento.
- **Integración (13)**:
  - Alta con hash y cambio obligatorio.
  - Correo repetido.
  - Permisos.
  - Edición auditada sin datos personales.
  - Nadie cambia su propio rol.
  - Asistente → agente desactiva vínculos.
  - Agente → asistente exige reasignar y lo registra.
  - Desactivar con reasignación de clientes y recordatorios, cierre de sesiones, sin reasignar a inactivos, reactivar.
  - Restablecer contraseña y 2FA.
  - Condiciones (orden, nombre repetido, desactivar sin quitarla al cliente).
  - Tipos de consentimiento (código estable y único).
- **Humo en servidor de producción (17)**:
  - Las tres pantallas en español e inglés.
  - Flujo completo de cambio obligatorio: contraseña temporal → todas las pantallas llevan a cambiarla → no acepta la misma → cambio correcto → sigue a configurar 2FA → auditado.
