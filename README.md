# Servicio de Fisioterapia · Orihuela

Gestión del servicio de fisioterapia con **Google Sheets + Google Apps Script**: base de datos de usuarios, agenda de citas, valoraciones e historias clínicas (Google Docs). Este repositorio es la copia de seguridad del código.

Funciona de dos formas a la vez:

- **Dentro de la hoja de cálculo**: menús personalizados (📅 Agenda, 🧍 Pacientes, ⚙️ Configuración) y diálogos modales.
- **Como Web App** (`doGet`): Agenda, Base de Datos y Valoraciones como pestañas de una aplicación web, de uso personal.

## Estructura del proyecto

| Carpeta | Contenido |
|---|---|
| `core/` | Base común: `Config.gs` (nombres de hojas, columnas y claves de propiedades), `Utils.gs` (funciones compartidas), `Menu.gs`, `OnEdit.gs`, `PanelAdmin.gs` y `WebApp.gs` (router de la Web App) |
| `usuarios/` | Alta, edición, búsqueda y ordenación de usuarios; Base de Datos web; WhatsApp; sincronización con Contactos de Google |
| `agenda/` | Citas, vista web de la Agenda, agenda semanal, eventos, recordatorios, copiar a la siguiente cita/semana y exportación a Google Calendar |
| `valoraciones/` | Formulario de valoración y vista web de evolución |
| `historia/` | Generación de historias clínicas desde plantilla, apertura de HCs y buscador de historias huérfanas |
| `ui/` | Piezas compartidas de interfaz: CSS global, ficha lateral de usuario, selector de fecha, cierre de formularios y modal de deshacer |
| `herramientas/` | Utilidades esporádicas o de un solo uso (aplanar agenda, generar curso, normalizar celdas/Drive, backup…) |

Convención de archivos: `X.gs` es la lógica del servidor y `X_Vista.html` (o `Panel_*.html`, `Dialogo_*.html`) su interfaz. Los `.html` que empiezan por `JS_` o `CSS_` se incluyen en otras vistas con `include()`.

## Web App

El router está en `core/WebApp.gs` y sirve cada página según `?page=`. Sin parámetro abre la Base de Datos.

| `?page=` | Página |
|---|---|
| `baseDatos` (por defecto) | Base de Datos |
| `agenda` | Agenda |
| `valoraciones` | Valoraciones |
| `citas` | Formulario de citas |
| `nuevoPaciente` | Añadir usuario |
| `valoracion` | Formulario de valoración |
| `editarPaciente&fila=N` | Edición de un usuario |
| `huerfanaHC&fila=N` | Buscador de historia clínica huérfana |

Con `&embed=1` la página se abre como ventana emergente. Los formularios se cierran según el contexto en que estén abiertos (diálogo de Sheets, ventana emergente o pestaña); ver `ui/JS_Cierre_Formulario.html`.

## Configuración

- **Hojas y columnas**: todos los nombres están en `core/Config.gs`. Si renombras una pestaña o una cabecera en Sheets, solo hay que cambiarlo ahí.
- **Propiedades del script** (menú ⚙️): plantilla de historia clínica, carpeta de Drive de destino y mensaje de WhatsApp.
- **Servicios avanzados**: People API (contactos), activada en `appsscript.json`.
- **Zona horaria**: `Europe/Madrid`.

## Desarrollo

- Código local con VS Code y [clasp](https://github.com/google/clasp) (`.clasp.json`); autocompletado con `@types/google-apps-script`.
- Primera vez: `npm install`, luego `clasp pull` / `clasp push`.
- Los archivos con barra en el nombre (`agenda/Web_Vista`) son carpetas en este repositorio y prefijos en el editor de Apps Script.
- Los saltos de línea están normalizados a LF con `.gitattributes`.
