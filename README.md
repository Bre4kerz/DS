# JoSYS Services Dashboard

Panel CMDB para administrar clientes, servicios, infraestructura, licencias,
credenciales protegidas y alertas de vencimiento.

## Funciones principales

- Clientes e ítems agrupados por categorías personalizables.
- Licencias con tipo, proveedor, sucursal, cantidad, serial y vencimiento.
- Alertas visuales y correos programados de expiración.
- Registro de problemas de calidad de datos.
- Roles `superuser`, `admin` y `viewer`, permisos granulares y alcance por categoría.
- Plantillas de permisos y actualización automática mediante Realtime.
- Importación y exportación CSV protegida por `data.transfer`.
- Historial de entregas de correo y reintentos programados.
- Reglas configurables y filtros para calidad de datos.
- Credenciales cifradas con Supabase Vault y revelado exclusivo para admins.
- Historial por ítem y panel administrativo de auditoría.
- Cierre de sesión tras 15 minutos de inactividad.
- Restauración del cliente y filtros seleccionados después de iniciar sesión.
- Temas oscuro y claro guardados por usuario.
- Diseño adaptable para escritorio y dispositivos móviles.

## Tecnologías

- React 18, TypeScript y Vite.
- Tailwind CSS.
- Supabase Auth, PostgreSQL, RLS, Vault, Edge Functions y Cron.
- Resend para correo.
- Nginx y Docker para servir la aplicación compilada.

## Inicio rápido

### Requisitos

- Node.js 20 o posterior.
- Un proyecto Supabase.
- npm.

### Variables de entorno

Copia `.env.example` como `.env` y agrega los datos públicos del proyecto:

```env
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

La clave anónima está diseñada para utilizarse en el navegador. Nunca agregues
`service_role`, claves de Resend, contraseñas o secretos Cron a variables `VITE_*`.

### Instalación

```powershell
npm ci
npm run dev
```

La dirección local predeterminada de Vite es `http://localhost:5173`.

### Validación

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

El proyecto actualmente conserva dos advertencias de lint conocidas en
`FloatingLines.tsx` y `AuthContext.tsx`; no bloquean la compilación.

## Configuración de Supabase

Las migraciones están en `supabase/migrations` y deben aplicarse en orden por
nombre. Si no utilizas Supabase CLI:

1. Abre el proyecto en Supabase.
2. Entra en **SQL Editor**.
3. Crea una consulta nueva.
4. Copia el contenido de cada migración pendiente.
5. Ejecuta **Run** y confirma que finalice correctamente.

No ejecutes dos veces una migración que ya haya sido aplicada.

Para una instalación existente, la migración más reciente es:

```text
20260820_add_renewal_email_workflow.sql
```

La migración de acceso granular asigna inicialmente `superuser` a
`bhernandez@josys.com.mx`. Después de aplicar las migraciones pendientes,
despliega el frontend y vuelve a iniciar sesión para cargar los permisos.

## Acceso y permisos

- `superuser`: acceso completo y administración del panel de permisos.
- `admin`: conserva las capacidades administrativas, excepto administrar
  permisos, salvo que un superuser se lo conceda.
- `viewer`: lectura básica configurable.

La autorización real se aplica en PostgreSQL mediante RLS. Ocultar un botón en
React no concede ni revoca permisos.

Debe existir al menos un superuser. Un trigger impide eliminar o degradar al
último.

## Documentación

- [Guía de usuario](docs/USER_GUIDE.md)
- [Arquitectura y base de datos](docs/ARCHITECTURE.md)
- [Operación, alertas y despliegue](docs/OPERATIONS.md)
- [Modelo de seguridad](docs/SECURITY.md)

## Estructura resumida

```text
src/
  components/        Interfaz, dashboard y modales
  contexts/          Sesión y temporizador de inactividad
  hooks/             Acceso y transformación de datos
  lib/               Cliente Supabase, tipos y utilidades
supabase/
  migrations/        Esquema, RLS, Vault, alertas y auditoría
  functions/         Edge Function de vencimientos
docs/                Documentación técnica y operativa
```

## Compilación con Docker

```powershell
docker build -t josys-dashboard .
docker run --rm -p 8080:80 josys-dashboard
```

Abre `http://localhost:8080`. Las variables `VITE_*` se incorporan durante la
compilación; deben estar disponibles en la etapa `npm run build`.
