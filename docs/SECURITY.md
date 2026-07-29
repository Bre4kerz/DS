# Modelo de seguridad

## Principios

- PostgreSQL y RLS son el límite de autorización.
- El frontend nunca es una barrera de seguridad.
- La ausencia de rol no concede permisos administrativos.
- Las contraseñas no se consultan junto con los ítems.
- Toda operación sensible debe quedar auditada.

## Autenticación

Supabase Auth admite:

- correo y contraseña;
- Microsoft/Azure OAuth.

Para Microsoft, configura el proveedor Azure en Supabase y agrega los dominios
de desarrollo y producción a las URL autorizadas. El callback del frontend es:

```text
https://TU_DOMINIO/
```

La aplicación cierra la sesión después de 15 minutos sin actividad. Los eventos
de entrada, salida manual y salida por inactividad se envían al registro de
auditoría.

## Autorización

### Superuser

Tiene acceso completo. Puede conceder el panel de permisos a otros usuarios y
es la única cuenta que puede crear o modificar superusers. Siempre debe existir
al menos uno.

### Viewer

Puede leer los datos operativos permitidos por RLS. No puede modificar clientes,
ítems, roles, configuración ni credenciales.

### Admin

Conserva permisos administrativos predeterminados, pero cada capacidad puede
ser concedida o revocada.

La migración `20260803_add_granular_access_control.sql` impide:

- eliminar al último superuser;
- degradar al último superuser.

## Credenciales

Las contraseñas se almacenan en Supabase Vault. `cmdb_items` sólo expone
`has_credentials`.

RPC disponibles para administradores:

- `reveal_cmdb_credentials(uuid)`
- `save_cmdb_credentials(uuid, ...)`

Cada revelado o guardado se registra. El panel de auditoría nunca recibe el
contenido del secreto.

No debes:

- volver a agregar columnas de contraseña a `cmdb_items`;
- usar `select('*')` sobre fuentes que contengan secretos;
- incluir contraseñas en historial, logs o mensajes de error;
- guardar secretos en `localStorage`;
- colocar claves privadas en variables `VITE_*`.

## Auditoría

`cmdb_audit_logs` registra actor, momento, acción, entidad y valores
anteriores/nuevos. Las inserciones se generan mediante triggers o una RPC
controlada.

Protecciones:

- lectura exclusiva para admins;
- escritura directa revocada a usuarios;
- triggers con `SECURITY DEFINER`;
- tokens y contraseñas eliminados del metadata de sesión;
- retención automática de 15 días.

La auditoría del frontend registra sesiones exitosas. Para registrar IP real,
intentos fallidos o eventos externos al navegador se necesitaría integrar logs
del proveedor de autenticación o una función del lado servidor.

## Edge Function

`send-expiration-alerts`:

- acepta únicamente `POST`;
- valida `x-cron-secret`;
- usa `service_role` sólo en el servidor;
- no devuelve secretos;
- deduplica entregas;
- registra errores del proveedor.

La función tiene `Verify JWT` desactivado porque el Cron no utiliza una sesión de
usuario. El secreto personalizado es obligatorio.

## Revisión antes de desplegar

- [ ] `.env` no está incluido en Git.
- [ ] Sólo `anon key` aparece en el frontend.
- [ ] RLS está habilitado en todas las tablas expuestas.
- [ ] Existe al menos un admin.
- [ ] Los dominios OAuth y Resend coinciden exactamente.
- [ ] `CRON_SECRET` es aleatorio y no está en el código.
- [ ] Las migraciones se respaldaron y probaron.
- [ ] Typecheck, lint y build fueron ejecutados.
- [ ] Se probaron cuentas admin y viewer.

## Respuesta ante incidentes

Si una credencial o clave se expone:

1. Rótala inmediatamente.
2. Revoca sesiones si corresponde.
3. Revisa auditoría y logs de Supabase.
4. Determina qué usuarios o sistemas tuvieron acceso.
5. Elimina el secreto de archivos e historial de Git.
6. Documenta la causa y agrega una prevención verificable.
