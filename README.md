# Servicio de Fisioterapia · Orihuela

Gestión del servicio de fisioterapia con **Google Sheets + Google Apps Script**: base de datos de usuarios, agenda de citas (hoja plana "Citas"), valoraciones e historias clínicas (fichas web en hojas, sin Docs). Este repositorio es la copia de seguridad del código.

Se usa como **Web App** (`doGet`): Usuarios, Agenda, Valoraciones, Estadísticas y Configuración como pestañas de una aplicación web, con usuario y contraseña propios y dos roles (administrador y usuario). La hoja es solo la base de datos: no tiene menús ni diálogos.

## Estructura del proyecto

| Carpeta | Contenido |
|---|---|
| `core/` | Base común: `Config.gs` (nombres de hojas, columnas, claves de propiedades e interruptor de paneles), `Utils.gs` (funciones compartidas), `PanelAdmin.gs` y `WebApp.gs` (router de la Web App) |
| `usuarios/` | Alta, edición, búsqueda y ordenación de usuarios; pestaña Usuarios; WhatsApp; sincronización con Contactos de Google |
| `agenda/` | Capa de datos de la hoja "Citas" (`Citas_Datos.gs`), vista web de la Agenda, formulario de cita, disponibilidad y recordatorios |
| `valoraciones/` | Formulario de valoración y vista web de evolución |
| `historia/` | Historia clínica como ficha web (`HC_Web.gs`, `Panel_HC.html`, `HC_Vista.html`) y creación de HC (`Generar.gs`) |
| `ui/` | Piezas compartidas de interfaz: CSS global, ficha lateral de usuario, selector de fecha, login, barra de pestañas y modal de deshacer |
| `acceso/` | Control de acceso: puerta única `api`, cuentas, sesiones, «Registro» y funciones del editor |
| `configuracion/` | Pestaña Configuración (solo administrador): accesos, registro y emergencia |
| `herramientas/` | Utilidades esporádicas o de un solo uso (asignar IDs, backup…) |

Convención de archivos: `X.gs` es la lógica del servidor y `X_Vista.html` (o `Panel_*.html`, `Dialogo_*.html`) su interfaz. Los `.html` que empiezan por `JS_` o `CSS_` se incluyen en otras vistas con `include_()`.

## Web App

El router está en `core/WebApp.gs` y sirve cada página según `?page=`. Sin parámetro, o con uno desconocido, abre Usuarios.

| `?page=` | Página |
|---|---|
| `baseDatos` (por defecto) | Usuarios |
| `agenda` | Agenda |
| `valoraciones` | Valoraciones |
| `dashboard` | Estadísticas (solo administrador) |
| `configuracion` | Configuración (solo administrador) |
| `hc&id=ID_HC` | Historia clínica (ficha web) |

## Paneles de formulario bajo demanda

Los formularios del panel lateral (`Panel_Valoracion`, `Panel_Editar`, `Panel_Cita`, `Panel_Nuevo`, `Panel_HC`…) no van dentro del HTML de cada página: se descargan la primera vez que se abren y, además, se precargan en segundo plano cuando la página ya tiene lo suyo (la tabla, la semana o la lista).

- Las páginas los declaran con `<?!= incluirPanel_('ruta/Panel_X', 'PanelX'); ?>` (`core/WebApp.gs`) y el cargador está en `ui/JS_Paneles_Diferidos.html`.
- El servidor los sirve con la acción `obtenerPanelWeb` (`obtenerPanelWeb_`), que solo acepta los nombres de la lista `PANELES_DIFERIDOS_`.
- Al añadir un panel nuevo hay que darlo de alta en esa lista.
- Interruptor: `PANELES_BAJO_DEMANDA` en `core/Config.gs`. Con `false` los paneles vuelven a incluirse dentro de la página, como antes.
- `Panel_Recordatorios` y `Whatsapp_Dialogo` siguen incluidos con `include_()`: sus estilos o su HTML se usan fuera del panel.

## Configuración

- **Hojas y columnas**: todos los nombres están en `core/Config.gs`. Si renombras una pestaña o una cabecera en Sheets, solo hay que cambiarlo ahí.
- **Propiedades del script**: mensaje de WhatsApp (se cambia en el diálogo de WhatsApp con «Guardar como plantilla»; `configurarMensajeWhatsapp`, desde el editor, vuelve al texto por defecto).
- **Servicios avanzados**: People API (contactos), activada en `appsscript.json`.
- **Zona horaria**: `Europe/Madrid`.

## Desarrollo

- Código local con VS Code y [clasp](https://github.com/google/clasp) (`.clasp.json`); autocompletado con `@types/google-apps-script`.
- Primera vez: `npm install`, luego `clasp pull` / `clasp push`.
- Los archivos con barra en el nombre (`agenda/Web_Vista`) son carpetas en este repositorio y prefijos en el editor de Apps Script.
- Los saltos de línea están normalizados a LF con `.gitattributes`.
