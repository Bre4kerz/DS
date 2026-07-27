# Memoria persistente del proyecto DS

Actualizado: 2026-07-27

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
- La lógica de datos y presentación está concentrada principalmente en `src/components/DashboardCMDB.tsx` (~1300 líneas). Existen hooks extraídos en `src/hooks/`, pero el dashboard todavía duplica esa lógica y no los utiliza.

## Estado verificado

- 2026-07-27: `DashboardCMDB` pasó a usar `useCmdbData` como capa única para carga, roles, historial y operaciones CRUD; se eliminó la implementación duplicada de esas responsabilidades.
- `npm run typecheck`: pasa sin errores.
- `npm run lint`: pasa sin errores, con dos advertencias preexistentes en `FloatingLines.tsx` y `AuthContext.tsx`.
- `npm run build`: pasa; Vite advierte que el bundle principal minificado supera 500 kB.
- No se encontraron pruebas automatizadas, README ni archivo de ejemplo de variables de entorno.
- El worktree ya contenía modificaciones del usuario antes de este análisis; no deben sobrescribirse.

## Hallazgos prioritarios

1. **Crítico — credenciales sin protección adecuada.** `cred_password` y `cred_password_alt` se guardan como texto plano, se incluyen en consultas generales `select('*')`, llegan al navegador de todo usuario autenticado y las migraciones contienen contraseñas de ejemplo explícitas. Deben eliminarse del historial, rotarse si se usaron y migrarse a un almacén de secretos o cifrado del lado servidor con acceso auditado.

   **Actualización 2026-07-29:** se añadió `20260729_secure_cmdb_credentials.sql`. Migra contraseñas existentes a Supabase Vault, elimina las columnas de texto plano, protege metadatos con RLS/revocación de privilegios y expone RPCs admin-only para revelar/guardar. Cada revelado/guardado se audita. El frontend usa una selección explícita sin secretos y sólo solicita una credencial concreta bajo demanda. Falta aplicar la migración antes de desplegar este frontend y rotar cualquier contraseña de ejemplo que haya sido real.

2. **Crítico — autorización sólo visual.** Las políticas RLS permiten SELECT/INSERT/UPDATE/DELETE a cualquier usuario `authenticated`. El rol `viewer` sólo parece restringir controles de UI, por lo que un viewer puede llamar Supabase directamente. Además, si no existe fila de rol, el frontend asigna `admin`, un comportamiento fail-open. La autorización debe imponerse mediante RLS/funciones del servidor y el valor por defecto debe ser viewer o sin acceso.

   **Actualización 2026-07-27:** se añadió `20260727_secure_cmdb_authorization.sql`. La migración reemplaza las políticas permisivas: todos los usuarios autenticados pueden leer, pero sólo `is_cmdb_admin()` permite escribir clientes, items, historial y roles. El frontend ahora asigna `viewer` cuando no encuentra un rol. Falta aplicar la migración al proyecto Supabase y probarla con cuentas admin/viewer reales.

   **Actualización 2026-07-28:** Role Management permite modificar roles existentes. La migración `20260728_preserve_last_cmdb_admin.sql` añade un trigger que impide degradar o eliminar al último administrador; la interfaz también deshabilita esas acciones y muestra errores de Supabase.

3. **Alto — esquema no reproducible.** Las migraciones incluidas no crean `cmdb_user_roles` ni `cmdb_item_history`, y tampoco agregan claramente `cmdb_items.status`, `process`, `updated_by` ni `cmdb_clients.notes`, aunque el frontend los usa. Un entorno nuevo puede fallar en ejecución. Crear una migración completa, constraints, índices, triggers/auditoría y políticas RLS para esas entidades.

4. **Alto — errores de base de datos ignorados.** Varias operaciones de lectura/escritura/borrado no inspeccionan `error`; la UI puede reportar éxito o cerrar modales aunque Supabase haya fallado. Centralizar manejo de errores, mostrar feedback y no refrescar/cerrar hasta confirmar éxito.

5. **Medio — deuda estructural.** La duplicación de acceso a datos se eliminó al conectar `DashboardCMDB` con `useCmdbData`. Aún falta conectarlo con `useCmdbFilters` y `useCmdbModals`, y extraer sus componentes visuales grandes.

6. **Medio — inconsistencias funcionales.** Las categorías mezclan español e inglés (`Servidores` frente a `Servers`), los filtros usan variantes `All`/`Todos`, y el comentario del timeout dice 15 minutos mientras el valor real es 5 minutos. Normalizar constantes y textos.

7. **Medio — fechas y estados.** El estado derivado por vencimiento usa `new Date('YYYY-MM-DD')` y la hora local, lo que puede producir desfases cerca de medianoche. A la vez se persiste un campo `status`, creando dos fuentes de verdad. Definir una sola regla, preferiblemente calculada en servidor o con fechas UTC normalizadas.

8. **Medio — calidad y regresiones.** No hay pruebas. Priorizar tests para cálculo de vencimientos, agrupación/filtros, permisos, CRUD, historial y flujos de autenticación; integrar `typecheck`, `lint`, tests y build en CI.

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
