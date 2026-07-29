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

### Revisar auditoría

1. Abre **Audit logs**.
2. Filtra por autenticación, cambios de datos o seguridad.
3. Busca por correo, acción, cliente o registro.
4. Expande un evento para comparar valores anteriores y nuevos.

El panel carga los 500 eventos más recientes dentro de la retención disponible.
La limpieza automática se ejecuta diariamente y conserva 15 días.

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

### La sesión se cierra

El timeout esperado es de 15 minutos sin actividad. Escritura, clics,
desplazamiento y eventos táctiles reinician el temporizador.

### Safari conserva estilos antiguos

Cierra la pestaña y vuelve a abrirla, o limpia los datos del sitio. Los assets
generados por Vite utilizan hash, pero Safari puede mantener el documento previo.
