# Guía de usuario

## Acceso

Inicia sesión con correo y contraseña o con Microsoft. La sesión se cierra
automáticamente después de 15 minutos sin actividad.

El dashboard recuerda por usuario:

- último cliente seleccionado;
- categorías desplegadas;
- filtros de alertas;
- tema claro u oscuro.

## Navegación

### Buscar

El buscador encuentra clientes e ítems por nombre, IP, serial, versión,
proveedor o sucursal. Seleccionar un resultado abre el cliente y resalta el
registro.

### Clientes

La barra lateral muestra:

- cantidad total de clientes;
- cantidad total de ítems;
- problemas de calidad pendientes;
- filtro por categoría;
- resumen de servicios y alertas por cliente.

Selecciona cualquier cliente para ver sus categorías en el panel principal.

### Categorías e ítems

Presiona una categoría para desplegar sus ítems. En una fila puedes:

- abrir u ocultar credenciales, si eres admin;
- copiar la IP;
- consultar historial;
- clonar;
- editar;
- eliminar.

Al guardar una edición, la ventana de edición se cierra, la lista permanece
abierta y el registro modificado se resalta temporalmente.

## Crear o editar registros

La opción **New record** está disponible para administradores.

1. Selecciona o crea el cliente.
2. Selecciona o crea la categoría.
3. Completa los campos del registro.
4. Para licencias, registra tipo, proveedor, sucursal, serial/licencia,
   cantidad y vencimiento.
5. Guarda el registro.

Las categorías y tipos personalizados quedan disponibles a partir de los datos
existentes.

## Credenciales

Sólo administradores pueden guardar o revelar credenciales.

- Las contraseñas aparecen ocultas inicialmente.
- Utiliza el icono del ojo para mostrarlas.
- Utiliza copiar para enviarlas al portapapeles.
- Cierra el detalle cuando termines.

Cada revelado o modificación queda registrado en auditoría.

## Expiration alerts

El panel muestra licencias vencidas o próximas a vencer según el umbral y estado
seleccionados.

- Presiona una alerta para ir al registro.
- Usa **View all** para consultar todos los resultados.
- Corrige fecha, proceso u otros campos desde la edición.

## Data Quality Issues

Muestra licencias con información importante faltante. Selecciona una incidencia
para navegar al ítem relacionado.

La incidencia se marcará como resuelta durante la siguiente ejecución del
proceso de alertas después de corregir el registro.

## Funciones administrativas

### Email alerts

Configura activación, remitente, destinatarios y umbrales.

### Access Control

El superuser puede asignar roles, conceder permisos funcionales y definir qué
categorías puede ver o editar cada usuario. Puede permitir que otra cuenta
administre permisos, pero sólo un superuser puede modificar superusers. El
sistema no permite eliminar ni degradar al último superuser.

### Audit logs

Consulta inicios y cierres de sesión, modificaciones, roles y accesos a
credenciales. Los registros se conservan durante 15 días.

## Tema visual

El interruptor de luna/sol cambia entre modo oscuro y claro. El modo oscuro es
el valor predeterminado y la selección se guarda por usuario.

## Uso móvil

En teléfonos:

- la barra administrativa se presenta como una fila compacta de iconos;
- el contenido aparece en una sola columna;
- las tablas ocultan información secundaria o permiten desplazamiento;
- los formularios y modales utilizan desplazamiento vertical interno.

Los iconos del encabezado incluyen una descripción accesible y un título para
identificar su función.
