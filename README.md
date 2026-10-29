# Servicio de Fisioterapia · Orihuela

Gestión del servicio de fisioterapia con **Google Sheets + Google Apps Script**: base de datos de usuarios, agenda de citas (hoja plana "Citas"), valoraciones e historias clínicas (fichas web en hojas, sin Docs). Este repositorio es la copia de seguridad del código.

Se usa como **Web App** (`doGet`): Agenda, Usuarios y Valoraciones como pestañas de una aplicación web, de uso personal. La hoja es solo la base de datos: no tiene menús ni diálogos.

## Estructura del proyecto

| Carpeta | Contenido |
|---|---|
| `core/` | Base común: `Config.gs` (nombres de hojas, columnas, claves de propiedades e interruptor de paneles), `Utils.gs` (funciones compartidas), `PanelAdmin.gs` y `WebApp.gs` (router de la Web App) |
| `usuarios/` | Alta, edición, búsqueda y ordenación de usuarios; pestaña Usuarios; WhatsApp; sincronización con Contactos de Google |
| `agenda/` | Capa de datos de la hoja "Citas" (`Citas_Datos.gs`), vista web de la Agenda, formulario de cita, disponibilidad y recordatorios |
| `valoraciones/` | Formulario de valoración y vista web de evolución |
| `historia/` | Historia clínica como ficha web (`HC_Web.gs`, `Panel_HC.html`, `HC_Vista.html`) y creación de HC (`Generar.gs`) |
| `ui/` | Piezas compartidas de interfaz: CSS global, ficha lateral de usuario, selector de fecha, cierre de formularios y modal de deshacer |
| `herramientas/` | Utilidades esporádicas o de un solo uso (asignar IDs, backup…) |

Convención de archivos: `X.gs` es la lógica del servidor y `X_Vista.html` (o `Panel_*.html`, `Dialogo_*.html`) su interfaz. Los `.html` que empiezan por `JS_` o `CSS_` se incluyen en otras vistas con `include()`.

## Web App

El router está en `core/WebApp.gs` y sirve cada página según `?page=`. Sin parámetro abre Usuarios.

| `?page=` | Página |
|---|---|
| `baseDatos` (por defecto) | Usuarios |
| `agenda` | Agenda |
| `valoraciones` | Valoraciones |
| `citas` | Formulario de citas |
| `valoracion` | Formulario de valoración |
| `hc&id=ID_HC` | Historia clínica (ficha web) |

Con `&embed=1` la página se abre como ventana emergente. Los formularios se cierran según el contexto en que estén abiertos (ventana emergente o pestaña); ver `ui/JS_Cierre_Formulario.html`.

## Paneles de formulario bajo demanda

Los formularios del panel lateral (`Panel_Valoracion`, `Panel_Editar`, `Panel_Cita`, `Panel_Nuevo`, `Panel_HC`…) no van dentro del HTML de cada página: se descargan la primera vez que se abren y, además, se precargan en segundo plano unos segundos después de cargar la página.

- Las páginas los declaran con `<?!= incluirPanel('ruta/Panel_X', 'PanelX'); ?>` (`core/WebApp.gs`) y el cargador está en `ui/JS_Paneles_Diferidos.html`.
- El servidor los sirve con `obtenerPanelWeb()`, que solo acepta los nombres de la lista `PANELES_DIFERIDOS_`.
- Al añadir un panel nuevo hay que darlo de alta en esa lista.
- Interruptor: `PANELES_BAJO_DEMANDA` en `core/Config.gs`. Con `false` los paneles vuelven a incluirse dentro de la página, como antes.
- `Panel_Recordatorios` y `Whatsapp_Dialogo` siguen incluidos con `include()`: sus estilos o su HTML se usan fuera del panel.

## Configuración

- **Hojas y columnas**: todos los nombres están en `core/Config.gs`. Si renombras una pestaña o una cabecera en Sheets, solo hay que cambiarlo ahí.
- **Propiedades del script**: mensaje de WhatsApp (se cambia ejecutando `configurarMensajeWhatsapp` desde el editor).
- **Servicios avanzados**: People API (contactos), activada en `appsscript.json`.
- **Zona horaria**: `Europe/Madrid`.

## Desarrollo

- Código local con VS Code y [clasp](https://github.com/google/clasp) (`.clasp.json`); autocompletado con `@types/google-apps-script`.
- Primera vez: `npm install`, luego `clasp pull` / `clasp push`.
- Los archivos con barra en el nombre (`agenda/Web_Vista`) son carpetas en este repositorio y prefijos en el editor de Apps Script.
- Los saltos de línea están normalizados a LF con `.gitattributes`.
