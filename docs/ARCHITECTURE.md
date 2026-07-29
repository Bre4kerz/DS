# Arquitectura y base de datos

## Flujo general

```text
Navegador
  ├─ React / Vite
  ├─ Supabase Auth
  └─ Cliente Supabase con anon key
          │
          ├─ PostgreSQL + RLS
          ├─ RPC de credenciales + Vault
          └─ RPC de eventos de sesión

Supabase Cron
  └─ Edge Function send-expiration-alerts
          ├─ PostgreSQL con service role
          └─ API de Resend
```

El frontend nunca debe utilizar la clave `service_role`. Las operaciones del
usuario se realizan con su JWT y PostgreSQL decide si están autorizadas.

## Componentes del frontend

| Archivo | Responsabilidad |
|---|---|
| `src/App.tsx` | Selecciona login o dashboard según la sesión. |
| `src/contexts/AuthContext.tsx` | Autenticación, OAuth, auditoría de sesión e inactividad. |
| `src/components/LoginPage.tsx` | Acceso por correo/contraseña y Microsoft. |
| `src/components/DashboardCMDB.tsx` | Navegación, filtros, paneles administrativos y presentación. |
| `src/components/ItemModal.tsx` | Creación y edición de ítems y credenciales. |
| `src/hooks/useCmdbData.ts` | Lectura y operaciones principales de datos. |
| `src/lib/supabase.ts` | Cliente, tipos, estados de expiración y RPC de credenciales. |
| `src/index.css` | Tailwind, animaciones, modo claro y correcciones responsive. |

## Entidades principales

### `cmdb_clients`

Catálogo de clientes. Un cliente puede contener múltiples ítems.

### `cmdb_items`

Registro CMDB. Los campos principales incluyen:

- `client_id`
- `category`
- `item_type`
- `name`
- `vendor`
- `branch`
- `qty`
- `ip`
- `serial`
- `expiration_date`
- `process`
- `has_credentials`

Las contraseñas no forman parte de esta tabla.

### `cmdb_user_roles`

Asocia usuarios con `superuser`, `admin` o `viewer`.

### Permisos y categorías

- `cmdb_user_permissions`: overrides funcionales por usuario/rol.
- `cmdb_user_category_access`: visibilidad y edición por categoría.

Las funciones `cmdb_has_permission()`, `cmdb_can_view_category()` y
`cmdb_can_edit_category()` son utilizadas por RLS.

### `cmdb_item_credentials`

Contiene metadatos de acceso y referencias a secretos de Vault. No puede
consultarse directamente desde el navegador.

### `cmdb_credential_access_log`

Registra revelados y guardados de credenciales. Nunca registra el contenido de
las contraseñas.

### `cmdb_item_history`

Historial funcional de cambios por ítem utilizado por el modal **History**.

### Alertas

- `cmdb_alert_settings`: configuración global de correos.
- `cmdb_expiration_notifications`: deduplicación e historial de entregas.
- `cmdb_data_quality_issues`: incidencias detectadas y resueltas.

### `cmdb_audit_logs`

Auditoría administrativa de:

- sesiones;
- clientes e ítems;
- roles;
- configuración de alertas;
- acceso y guardado de credenciales.

Sólo admins pueden leerla. No admite inserciones, ediciones o eliminaciones
directas desde la API. Un trabajo diario elimina eventos mayores a 15 días.

## Migraciones

| Migración | Objetivo |
|---|---|
| `20260525183044_create_cmdb_tables.sql` | Tablas iniciales. |
| `20260525191443_restructure_cmdb_hierarchical.sql` | Relación jerárquica cliente/ítem. |
| `20260525194109_add_cmdb_credentials.sql` | Credenciales iniciales heredadas. |
| `20260603_add_process_updated_at.sql` | Fecha del proceso de renovación. |
| `20260727_remove_anon_policies.sql` | Elimina políticas anónimas antiguas. |
| `20260727_secure_cmdb_authorization.sql` | Roles, historial y RLS admin/viewer. |
| `20260728_preserve_last_cmdb_admin.sql` | Protege al último administrador. |
| `20260729_secure_cmdb_credentials.sql` | Migra secretos a Vault y elimina texto plano. |
| `20260730_add_license_vendor_branch.sql` | Proveedor y sucursal de licencias. |
| `20260731_add_license_quantity.sql` | Cantidad de licencias. |
| `20260801_add_expiration_email_alerts.sql` | Correos, entregas y calidad de datos. |
| `20260802_add_admin_audit_logs.sql` | Auditoría administrativa y retención. |
| `20260803_add_granular_access_control.sql` | Superuser, permisos y alcance por categorías. |
| `20260804_add_quality_rules_and_data_transfer.sql` | Reglas de calidad, transferencia y Realtime. |

## Carga diferida

`App.tsx` separa login y dashboard mediante `React.lazy`. El módulo de
importación/exportación también se descarga únicamente cuando el usuario abre
la herramienta. Esto reduce el JavaScript inicial del dashboard y evita cargar
los efectos visuales del login durante una sesión activa.

## Estado de navegación local

El navegador guarda por ID de usuario:

- cliente seleccionado;
- categorías abiertas;
- filtros de categoría y alertas;
- preferencia de tema.

No se guardan contraseñas, credenciales reveladas ni formularios de edición.

## Estados de expiración

- `Expired`: fecha anterior al día actual.
- `Expiring`: faltan 30 días o menos.
- `OK`: faltan más de 30 días.
- `No date`: fecha inexistente o inválida.

El cálculo utiliza días calendario para evitar desfases por zona horaria.
