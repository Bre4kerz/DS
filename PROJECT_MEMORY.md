# Memoria persistente del proyecto DS

Actualizado: 2026-09-09

## Propósito

Aplicación web interna tipo CMDB para administrar clientes y sus activos/servicios de TI. Permite consultar y editar inventario, agruparlo por cliente y categoría, buscar registros, controlar vencimientos, guardar credenciales, revisar historial de cambios y asignar roles.

## Arquitectura actual

- Frontend SPA: React 18 + TypeScript + Vite.
- Estilos: Tailwind CSS y CSS propio.
- Backend/BaaS: Supabase (PostgreSQL, Auth y RLS).
- Autenticación: correo/contraseña y Microsoft/Azure OAuth.
- Despliegue: build multi-stage con Node 20 y Nginx.
- Entrada: `src/main.tsx` -> `src/App.tsx` -> `AuthProvider` -> `LoginPage` o `DashboardCMDB`.
- Modelo principal: `cmdb_clients`, `cmdb_items`; el frontend también espera `cmdb_item_history` y `cmdb_user_roles`.
- La lógica de presentación está en `src/components/DashboardCMDB.tsx` (~2270 líneas; llegó a ~3860 antes de la limpieza de 2026-09-09). Los subcomponentes visuales viven en `src/components/dashboard/`, y `DashboardCMDB` consume `useCmdbData`, `useCmdbFilters` y `useCmdbModals` como única fuente de estado — ya no duplica esa lógica.

## Estado verificado

- 2026-07-27: `DashboardCMDB` pasó a usar `useCmdbData` como capa única para carga, roles, historial y operaciones CRUD; se eliminó la implementación duplicada de esas responsabilidades.
- 2026-09-09: extracción de componentes visuales + conexión a `useCmdbFilters`/`useCmdbModals` (ver hallazgo 5). Verificado manualmente por el usuario contra el servidor local (abre y muestra datos correctamente) además de `typecheck`/`lint`/`build`/`test`.
- `npm run typecheck`: pasa sin errores.
- `npm run lint`: pasa sin errores, con dos advertencias preexistentes en `FloatingLines.tsx` y `AuthContext.tsx`.
- `npm run build`: pasa sin advertencias de tamaño de chunk — el chunk de `LoginPage` bajó de ~574 kB a ~70 kB al cambiar el fondo de `three.js` a OGL (`Topography`), eliminando la advertencia de bundle >500 kB que existía antes.
- `npm run test`: 2 archivos, 5 tests, todos pasan.
- El worktree ya contenía modificaciones del usuario antes de este análisis; no deben sobrescribirse.

## Hallazgos prioritarios

1. **Crítico — credenciales sin protección adecuada.** `cred_password` y `cred_password_alt` se guardan como texto plano, se incluyen en consultas generales `select('*')`, llegan al navegador de todo usuario autenticado y las migraciones contienen contraseñas de ejemplo explícitas. Deben eliminarse del historial, rotarse si se usaron y migrarse a un almacén de secretos o cifrado del lado servidor con acceso auditado.

   **Actualización 2026-07-29:** se añadió `20260729_secure_cmdb_credentials.sql`. Migra contraseñas existentes a Supabase Vault, elimina las columnas de texto plano, protege metadatos con RLS/revocación de privilegios y expone RPCs admin-only para revelar/guardar. Cada revelado/guardado se audita. El frontend usa una selección explícita sin secretos y sólo solicita una credencial concreta bajo demanda. Falta aplicar la migración antes de desplegar este frontend y rotar cualquier contraseña de ejemplo que haya sido real.

2. **Crítico — autorización sólo visual.** Las políticas RLS permiten SELECT/INSERT/UPDATE/DELETE a cualquier usuario `authenticated`. El rol `viewer` sólo parece restringir controles de UI, por lo que un viewer puede llamar Supabase directamente. Además, si no existe fila de rol, el frontend asigna `admin`, un comportamiento fail-open. La autorización debe imponerse mediante RLS/funciones del servidor y el valor por defecto debe ser viewer o sin acceso.

   **Actualización 2026-07-27:** se añadió `20260727_secure_cmdb_authorization.sql`. La migración reemplaza las políticas permisivas: todos los usuarios autenticados pueden leer, pero sólo `is_cmdb_admin()` permite escribir clientes, items, historial y roles. El frontend ahora asigna `viewer` cuando no encuentra un rol. Falta aplicar la migración al proyecto Supabase y probarla con cuentas admin/viewer reales.

   **Actualización 2026-07-28:** Role Management permite modificar roles existentes. La migración `20260728_preserve_last_cmdb_admin.sql` añade un trigger que impide degradar o eliminar al último administrador; la interfaz también deshabilita esas acciones y muestra errores de Supabase.

3. **Alto — esquema no reproducible.** Las migraciones incluidas no crean `cmdb_user_roles` ni `cmdb_item_history`, y tampoco agregan claramente `cmdb_items.status`, `process`, `updated_by` ni `cmdb_clients.notes`, aunque el frontend los usa. Un entorno nuevo puede fallar en ejecución. Crear una migración completa, constraints, índices, triggers/auditoría y políticas RLS para esas entidades.

4. **Alto — errores de base de datos ignorados.** Varias operaciones de lectura/escritura/borrado no inspeccionan `error`; la UI puede reportar éxito o cerrar modales aunque Supabase haya fallado. Centralizar manejo de errores, mostrar feedback y no refrescar/cerrar hasta confirmar éxito.

5. **Medio — deuda estructural.** La duplicación de acceso a datos se eliminó al conectar `DashboardCMDB` con `useCmdbData`.

   **Actualización 2026-09-09:** se extrajeron 11 componentes visuales de `DashboardCMDB.tsx` a `src/components/dashboard/` (ThemeToggle, StatusPill, SectionCard, los tres modales bulk, etc.) y se conectó el componente a `useCmdbFilters`/`useCmdbModals`, que estaban desactualizados respecto al comportamiento real (defaults `All`/`Todos`, faltaba la variante `alerts` del stats modal, `newItemDefaults`, `matchingClientResults`, restauración de navegación al recargar) y se actualizaron para igualar el comportamiento existente antes de conectarlos. `DashboardCMDB.tsx` bajó de ~3860 a ~2270 líneas. Sigue pendiente partir el cuerpo principal de `DashboardCMDB` (aún ~2270 líneas: estado de roles/auditoría/calidad de datos y todo el JSX) en piezas más pequeñas.

6. **Medio — inconsistencias funcionales.** Las categorías mezclan español e inglés (`Servidores` frente a `Servers`), y el comentario del timeout dice 15 minutos mientras el valor real es 5 minutos. Normalizar constantes y textos.

   **Actualización 2026-09-09:** la variante `All`/`Todos` en los filtros de categoría/estado se normalizó a `All` al actualizar `useCmdbFilters` (ver hallazgo 5).

7. **Medio — fechas y estados.** El estado derivado por vencimiento usa `new Date('YYYY-MM-DD')` y la hora local, lo que puede producir desfases cerca de medianoche. A la vez se persiste un campo `status`, creando dos fuentes de verdad. Definir una sola regla, preferiblemente calculada en servidor o con fechas UTC normalizadas.

8. **Medio — calidad y regresiones.** No hay pruebas. Priorizar tests para cálculo de vencimientos, agrupación/filtros, permisos, CRUD, historial y flujos de autenticación; integrar `typecheck`, `lint`, tests y build en CI.

   **Actualización 2026-08-01:** se añadió infraestructura para correos de expiración y calidad de datos. `20260801_add_expiration_email_alerts.sql` crea configuración, auditoría de entregas y problemas deduplicados. `send-expiration-alerts` valida licencias, resuelve incidencias corregidas, evita correos duplicados y envía resúmenes mediante Resend. El dashboard permite configurar alertas y consultar problemas. Falta aplicar la migración, desplegar la Edge Function, configurar `RESEND_API_KEY`/`CRON_SECRET` y crear el Cron diario.

**Actualización 2026-08-02:** se añadió `20260802_add_admin_audit_logs.sql` con auditoría inmutable de sesiones, clientes, ítems, roles, configuración de alertas y accesos/guardados de credenciales. Sólo administradores pueden consultar los eventos; PostgreSQL elimina automáticamente registros mayores a 15 días mediante `pg_cron`. El dashboard incorpora búsqueda, filtros y detalle de valores anteriores/nuevos. `AuthContext` diferencia cierre manual y cierre por inactividad. Falta aplicar la migración remota antes de utilizar el panel.

**Actualización de login 2026-09-09:** el fondo del login pasó de `FloatingLines` (three.js) a `Topography` (OGL, más liviano) en `src/components/Topography.tsx`; el logo (`src/assets/logo1.png`) se recoloreó a tono casi blanco conservando su transparencia y el degradado cyan original sobre la "o". Se agregó un checkbox "Stay signed in" que, cuando está marcado, omite el auto-logout de 15 minutos de inactividad (la preferencia se guarda en `localStorage` por email). Se quitó la integración de Vercel Speed Insights.

**Actualización de tema:** el dashboard incluye modos oscuro (predeterminado) y claro. La selección se guarda en `localStorage` con una clave separada por ID de usuario y se aplica también a modales y formularios.

**Actualización de documentación:** `README.md` es la entrada principal y `docs/` contiene guía de usuario, arquitectura/base de datos, operación/despliegue y seguridad. `.env.example` documenta únicamente las variables públicas requeridas.

**Actualización de acceso granular:** `20260803_add_granular_access_control.sql` añade `superuser`, permisos funcionales y restricciones de visualización/edición por categoría. La migración promueve `bhernandez@josys.com.mx`, protege al último superuser y reemplaza políticas RLS relevantes. El modal de roles se convirtió en **Access Control**. Falta ejecutar esta migración en Supabase antes de desplegar el frontend asociado.

**Actualización 2026-08-04:** se añadió `data.transfer` y `quality.configure`, plantillas de permisos, sincronización Realtime, importación/exportación CSV con validación, historial de entregas con cola de reenvío, reglas/filtros de calidad, pruebas Vitest/SQL y carga diferida. `20260804_add_quality_rules_and_data_transfer.sql` debe aplicarse después de `20260803`, y la Edge Function debe volver a desplegarse.

**Pendiente — correo de proceso de renovación estancado:** enriquecer el aviso con cliente/licencia, vencimiento y días restantes, proceso actual, días detenido, fecha del último seguimiento, responsable asignado, enlace directo al registro y acción recomendada. Los primeros cuatro datos ya están incluidos. Para terminarlo habrá que agregar responsable de renovación al esquema, configurar la URL base del dashboard y definir la recomendación correspondiente a cada etapa.

## Fortalezas

- Separación inicial de autenticación, utilidades y algunos hooks.
- Tipos de dominio explícitos y funciones puras para resumen/agrupación.
- RLS está activado y las políticas anónimas de demo se eliminan en la migración más reciente.
- Docker/Nginx proporcionan una ruta de despliegue simple para la SPA.
- La interfaz ya cubre un conjunto amplio y útil de operaciones CMDB.

## Orden recomendado

1. Corregir autorización RLS y tratamiento de secretos.
2. Completar y probar las migraciones desde una base vacía.
3. Hacer pasar typecheck/lint/build y agregar pruebas mínimas.
4. Unificar la capa de datos/hooks y dividir `DashboardCMDB`.
5. Normalizar categorías, textos, fechas y manejo de errores.

## Contexto operativo para futuras sesiones

- Variables requeridas: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- No asumir que un control oculto en React protege una operación; Supabase debe autorizarla.
- Antes de modificar, revisar `git status` porque hay trabajo local no confirmado.
- Esta memoria describe el estado observado el 2026-07-27; volver a ejecutar validaciones después de cambios.
