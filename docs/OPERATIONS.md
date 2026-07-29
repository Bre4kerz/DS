# Operación, alertas y despliegue

## Administración cotidiana

### Crear un usuario

1. Crea o invita al usuario desde **Supabase > Authentication > Users**.
2. Inicia sesión como administrador.
3. Abre **Access Control**.
4. Registra su correo como `viewer`, `admin` o `superuser`.
5. Si corresponde, ajusta permisos y categorías.

Los usuarios sin rol se consideran `viewer`.

### Administrar roles

El panel solicita confirmación antes de cambiar o eliminar un rol. La base de
datos impide que el sistema quede sin superusers.

## Activar el control de acceso granular

Las migraciones requeridas, en este orden, son:

```text
supabase/migrations/20260803_add_granular_access_control.sql
supabase/migrations/20260804_add_quality_rules_and_data_transfer.sql
```

Si no utilizas Supabase CLI:

1. Abre **Supabase > SQL Editor > New query**.
2. Copia el archivo completo actualizado.
3. Presiona **Run**.
4. Despliega el frontend.
5. Cierra sesión y vuelve a entrar.

La cuenta inicial configurada como superuser es:

```text
bhernandez@josys.com.mx
```

El panel **Access Control** permite configurar:

| Permiso | Alcance |
|---|---|
| View records | Consultar clientes e ítems permitidos. |
| Create records | Crear clientes e ítems. |
| Edit records | Modificar registros dentro del alcance. |
| Delete records | Eliminar registros permitidos. |
| View credentials | Revelar credenciales protegidas. |
| Edit credentials | Guardar o sustituir credenciales. |
| View history | Consultar historial por ítem. |
| View alerts | Consultar alertas de vencimiento. |
| Configure alerts | Modificar correos y umbrales. |
| View data quality | Consultar incidencias. |
| Configure quality rules | Activar o desactivar validaciones. |
| View audit logs | Abrir auditoría administrativa. |
| Manage roles | Crear, cambiar o eliminar roles no protegidos. |
| Manage permissions | Abrir y modificar la matriz de permisos. |
| Import / export data | Descargar CSV y abrir el flujo de importación. |

El alcance por categoría contiene dos controles:

- **View**: la categoría y sus ítems son visibles.
- **Edit**: permite modificar ítems de esa categoría si también está activo
  `Edit records`.

Cuando no existe una configuración de categorías para un usuario, conserva el
alcance predeterminado completo de su rol. Al cambiar la primera categoría, el
panel guarda explícitamente el estado de todas las categorías actuales.

### Protección de superusers

- Solamente un superuser puede crear o modificar otro superuser.
- Un administrador delegado puede recibir `Manage permissions`.
- Un usuario delegado no puede modificar cuentas superuser.
- El último superuser no puede eliminarse ni degradarse.
- Todos los cambios se registran en **Audit logs**.

### Revisar auditoría

1. Abre **Audit logs**.
2. Filtra por autenticación, cambios de datos o seguridad.
3. Busca por correo, acción, cliente o registro.
4. Expande un evento para comparar valores anteriores y nuevos.

El panel carga los 500 eventos más recientes dentro de la retención disponible.
La limpieza automática se ejecuta diariamente y conserva 15 días.

## Importación y exportación CSV

El botón **Data** requiere `Import / export data`.

- La exportación incluye únicamente registros visibles para el usuario.
- Nunca incluye credenciales ni secretos.
- La importación exige además `Create records`.
- Se validan cliente, categoría, nombre, cantidad y formato de fecha.
- Se muestra una vista previa antes de guardar.
- Registros con la misma combinación cliente/categoría/nombre/serial se omiten.

Columnas admitidas:

```text
client,category,item_type,name,vendor,branch,qty,ip,serial,email,expiration_date,notes,process
```

## Plantillas y actualización de acceso

Access Control incluye plantillas `Viewer`, `Support`, `Renewals`, `Auditor` y
`Admin`. Aplicar una plantilla guarda explícitamente todos los permisos.

Los cambios se propagan mediante Supabase Realtime y el usuario afectado recibe
la configuración sin volver a iniciar sesión. Si Realtime está bloqueado por la
red, cerrar y volver a entrar fuerza la actualización.

## Alertas de vencimiento

### Configuración en el dashboard

Como administrador, abre **Email alerts** y configura:

- activación;
- remitente;
- destinatarios;
- umbrales en días.

Ejemplo de umbrales:

```text
90, 60, 30, 15, 7, 1, 0
```

La función evita enviar nuevamente la misma combinación de ítem, fecha de
expiración, umbral y destinatario.

**Delivery history** muestra hasta 500 entregas recientes. **Queue for resend**
elimina la marca de deduplicación; la alerta se enviará nuevamente en la
siguiente ejecución programada.

### Variables secretas de la Edge Function

Configura en **Supabase > Edge Functions > Secrets**:

```text
RESEND_API_KEY
CRON_SECRET
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están disponibles en el entorno de
Supabase Edge Functions. Nunca copies `SUPABASE_SERVICE_ROLE_KEY` al frontend.

### Despliegue

La función se encuentra en:

```text
supabase/functions/send-expiration-alerts/index.ts
```

Si utilizas Supabase CLI:

```powershell
supabase functions deploy send-expiration-alerts --no-verify-jwt
```

Se utiliza `--no-verify-jwt` porque la función aplica su propia autenticación
mediante `x-cron-secret`.

### Cron recomendado

Configura una solicitud diaria:

- Método: `POST`
- URL: `https://PROJECT_REF.supabase.co/functions/v1/send-expiration-alerts`
- Header `Content-Type`: `application/json`
- Header `x-cron-secret`: el valor de `CRON_SECRET`
- Body: `{}`
- Cron: `0 14 * * *`

La expresión está en UTC. Ajusta la hora si cambia el horario operativo deseado.

### Prueba manual

Usa **Test** en la función:

- Método: `POST`
- Headers:

```json
{
  "Content-Type": "application/json",
  "x-cron-secret": "YOUR_CRON_SECRET"
}
```

- Body:

```json
{}
```

Respuesta típica:

```json
{
  "licenses": 216,
  "issues": 913,
  "sent": 0,
  "failed": 0
}
```

`sent` cuenta alertas de vencimiento nuevas, no la cantidad física de correos.
Un valor `0` puede significar que las alertas ya estaban deduplicadas.

### Problemas de calidad detectados

- nombre ausente;
- cliente ausente;
- fecha de expiración ausente;
- tipo de licencia ausente;
- proveedor ausente;
- cantidad inválida;
- sucursal ausente;
- serial/licencia ausente;
- licencia vencida sin proceso de renovación.

La Edge Function marca automáticamente como resuelta una incidencia cuando el
registro es corregido.

El modal permite buscar por cliente/licencia, filtrar por severidad y, con
`Configure quality rules`, activar o desactivar validaciones. Los cambios se
aplican en la siguiente ejecución de `send-expiration-alerts`, por lo que debes
volver a desplegar la Edge Function después de actualizar su código.

## Pruebas automatizadas

```powershell
npm run test
```

Las pruebas unitarias cubren fechas de expiración y CSV. El archivo
`supabase/tests/granular_access_control.sql` contiene assertions de esquema para
ejecutar exclusivamente en un proyecto Supabase desechable después de aplicar
las migraciones.

## Despliegue del frontend

### Compilación

```powershell
npm ci
npm run typecheck
npm run lint
npm run build
```

Publica el contenido de `dist/` en el hosting estático.

### Docker

```powershell
docker build -t josys-dashboard .
docker run --rm -p 8080:80 josys-dashboard
```

Nginx utiliza fallback a `index.html`, necesario para una SPA.

## Respaldo y recuperación

Antes de migraciones importantes:

1. Genera o confirma un respaldo desde Supabase.
2. Conserva una copia de las migraciones aplicadas.
3. Prueba la restauración en un proyecto separado cuando el cambio sea crítico.
4. Verifica especialmente `cmdb_clients`, `cmdb_items`, roles y referencias de
   Vault.

No guardes exportaciones con información sensible en el repositorio.

## Diagnóstico rápido

### El correo no llega

- Confirma que las alertas estén activadas.
- Revisa que el dominio exacto del remitente esté verificado en Resend.
- Comprueba destinatarios y spam.
- Revisa logs de la Edge Function.
- Confirma `x-cron-secret`.
- Busca respuestas `failed` y el mensaje del proveedor.

### `sent` es cero

Puede no haber alertas nuevas para el umbral actual. El historial evita
duplicados aunque vuelvas a ejecutar la prueba.

### El panel de auditoría no carga

- Confirma que `20260802_add_admin_audit_logs.sql` se ejecutó.
- Comprueba que la cuenta sea admin.
- Cierra sesión y vuelve a entrar para generar el primer evento.
- Revisa errores RLS en la consola del navegador.

### Error SQL cerca de `current_role`

Una versión preliminar de la migración utilizaba `current_role`, que PostgreSQL
interpreta como palabra reservada. Utiliza el archivo actualizado, donde el CTE
se llama `active_cmdb_role`, y vuelve a ejecutar la consulta completa:

```text
ERROR: 42601: syntax error at or near "current_role"
```

Supabase normalmente revierte la consulta completa después de un error de
sintaxis. Si aparece un error diferente al reintentar, conserva el mensaje
exacto para determinar si quedó algún objeto parcial.

### La sesión se cierra

El timeout esperado es de 15 minutos sin actividad. Escritura, clics,
desplazamiento y eventos táctiles reinician el temporizador.

### Safari conserva estilos antiguos

Cierra la pestaña y vuelve a abrirla, o limpia los datos del sitio. Los assets
generados por Vite utilizan hash, pero Safari puede mantener el documento previo.
