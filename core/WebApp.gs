// Punto de entrada para acceder a formularios desde fuera de la hoja de cálculo.
// Despliegue: Implementar > Nueva implementación > Aplicación web
//   Ejecutar como: Yo
//   Quién tiene acceso: Solo yo
// ================================================================================

// ID de la hoja de cálculo. Ahora es solo un RESPALDO: getSS() usa antes la hoja a la
// que está vinculado el script, y solo recurre a este ID si no hay ninguna.
// Lo encuentras en la URL: https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
const SPREADSHEET_ID = "1D99N_jIQkZwZJ7IM2elk1nLxrIaUJIaSvldUX9yzQ2A";

/**
 * Devuelve la hoja de cálculo con la que trabaja el script.
 * Úsalo en lugar de SpreadsheetApp.getActiveSpreadsheet() en cualquier función
 * que deba poder ejecutarse tanto desde la Web App como desde el editor.
 *
 * Primero intenta la hoja a la que está vinculado el script, de modo que en una
 * COPIA de la hoja la Web App trabaje siempre con la copia (antes la
 * Web App abría por ID la hoja ORIGINAL aunque estuvieras en una copia). Si en ese
 * contexto no hay hoja vinculada, abre la del ID de respaldo, como hacía antes.
 */
function getSS() {
  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  return ss || SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Inyecta el contenido de otro archivo .html dentro de una plantilla, para
 * compartir fragmentos (CSS_Global, Modal_Deshacer, JS_Modal_Deshacer...)
 * entre BaseDatosWeb, AgendaWeb y ValoracionesWeb sin tenerlos copiados y
 * pegados en cada archivo. Se usa desde dentro de una plantilla con
 * <?!= include('NombreDeArchivo'); ?> — el "!" es importante: sin él, Apps
 * Script escapa el HTML/CSS/JS inyectado y sale como texto literal en vez
 * de interpretarse. Solo funciona en páginas servidas con
 * HtmlService.createTemplateFromFile(...) (no con createHtmlOutputFromFile).
 */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/**
 * Paneles de formulario que las páginas pueden pedir bajo demanda (obtenerPanelWeb).
 * Solo estos nombres se sirven: la función es llamable desde el navegador.
 */
const PANELES_DIFERIDOS_ = [
  'valoraciones/Panel_Valoracion',
  'valoraciones/Panel_Valoraciones',
  'usuarios/Panel_Editar',
  'agenda/Panel_Cita',
  'agenda/Panel_Disponibilidad',
  'usuarios/Panel_Nuevo',
  'historia/Panel_HC'
];

/**
 * Como include(), pero para un panel de formulario. Con PANELES_BAJO_DEMANDA = true no inyecta el panel:
 * deja un resguardo (ui/JS_Paneles_Diferidos) que lo descargará cuando haga falta. Con false equivale a include().
 *   <?!= incluirPanel('valoraciones/Panel_Valoracion', 'PanelValoracion'); ?>
 * @param {string} archivo Ruta del panel, sin extensión.
 * @param {string} global  Nombre del objeto global que define el panel (window.PanelValoracion...).
 */
function incluirPanel(archivo, global) {
  if (!PANELES_BAJO_DEMANDA) return include(archivo);
  return '<script>PanelesDiferidos.registrar(' + JSON.stringify(global) + ',' + JSON.stringify(archivo) + ');</script>';
}

/**
 * Entrega a la página los estados, la gravedad y los tipos de ingreso de core/Config.gs (ESTADOS_PACIENTE,
 * GRAVEDAD_PACIENTE, TIPOS_INGRESO) como variables globales del navegador. Se pone UNA vez por página, antes de
 * ui/JS_Ficha y de los paneles que las usan.
 */
function incluirEstados() {
  return '<script>var ESTADOS_PACIENTE = ' + JSON.stringify(ESTADOS_PACIENTE) + ';' +
    ' var GRAVEDAD_PACIENTE = ' + JSON.stringify(GRAVEDAD_PACIENTE) + ';' +
    ' var TIPOS_INGRESO = ' + JSON.stringify(TIPOS_INGRESO) + ';</script>';
}

/** Devuelve el HTML de un panel (estilos, plantilla y script) para que el navegador lo monte al abrirlo. */
function obtenerPanelWeb(archivo) {
  if (PANELES_DIFERIDOS_.indexOf(archivo) === -1) throw new Error('Panel no disponible: ' + archivo);
  return include(archivo);
}

/**
 * Pasa a una plantilla las dos variables que necesita JS_Cierre_Formulario
 * para cerrar el formulario según dónde esté abierto:
 *   'popup'   → ventana emergente (window.open) de la Web App (?embed=1)
 *   'pestana' → Web App como página independiente
 */
function prepararContexto_(template, contexto) {
  template.contexto = contexto;
  template.baseUrl = ScriptApp.getService().getUrl();
  return template;
}

/**
 * Router de la Web App. Sirve una página HTML distinta según el parámetro ?page=.
 * Sin parámetro, muestra un índice con enlaces a todos los formularios.
 * Añadir un formulario nuevo en el futuro es solo añadir una entrada a este mapa.
 *
 * Ejemplos de URL:
 *   https://script.google.com/macros/s/AAAA.../exec                → índice
 *   https://script.google.com/macros/s/AAAA.../exec?page=agenda
 */
const PAGINAS_WEB = {
  baseDatos:     { archivo: 'usuarios/BaseDatos_Vista',                 titulo: 'Usuarios',     icono: 'folder_shared' },
  agenda:        { archivo: 'agenda/Web_Vista',                    titulo: 'Agenda',            icono: 'calendar_month' },
  valoraciones:  { archivo: 'valoraciones/Web_Vista',              titulo: 'Valoraciones',      icono: 'monitoring' },
  dashboard:     { archivo: 'dashboard/Web_Vista',                 titulo: 'Estadísticas',         icono: 'dashboard' },
  guiaVisual:    { archivo: 'ui/Guia_Visual',                      titulo: 'Guía visual',          icono: 'palette' }   // banco de pruebas visual (D-V7); sin pestaña
};

function doGet(e) {
  // Sin ?page= → directamente Usuarios (el índice de navegación ya no
  // hace falta ahora que Agenda, Usuarios y Valoraciones son pestañas
  // entre las que se puede saltar, y el resto de formularios se abren desde
  // botones dentro de ellas).
  const page = (e && e.parameter && e.parameter.page) || 'baseDatos';
  // Ventana emergente (window.open desde la Web App) o pestaña independiente.
  const contexto = (e && e.parameter && e.parameter.embed === '1') ? 'popup' : 'pestana';

  // Caso especial: ficha de historia clínica en HTML (?page=hc&id=ID_HC o &idPaciente=ID_PACIENTE).
  if (page === 'hc') {
    return servirFichaHCWeb(e.parameter);
  }

  const config = PAGINAS_WEB[page];
  if (!config) {
    return construirIndiceWeb(); // parámetro desconocido → volvemos al índice
  }

  // BaseDatosWeb, AgendaWeb, ValoracionesWeb y Estadísticas necesitan la URL absoluta de
  // despliegue para abrir ventanas emergentes propias (editar, valoración...)
  // y para los enlaces de las pestañas — un href relativo no resuelve bien
  // dentro del iframe en el que Google sirve la Web App.
  if (page === 'baseDatos' || page === 'agenda' || page === 'valoraciones' || page === 'dashboard' || page === 'guiaVisual') {
    const template = HtmlService.createTemplateFromFile(config.archivo);
    template.baseUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle(config.titulo)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // 'citas' acepta un usuario ya elegido desde la tabla de
  // Usuarios (?paciente=NOMBRE), para no tener que volver a buscarlo.
  if (page === 'citas') {
    const template = HtmlService.createTemplateFromFile(config.archivo);
    template.pacientePreseleccionado = e.parameter.paciente || '';
    prepararContexto_(template, contexto);
    return template.evaluate()
      .setTitle(config.titulo)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutputFromFile(config.archivo)
    .setTitle(config.titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Genera una página sencilla con enlaces a cada formulario disponible.
 * Se construye a partir de PAGINAS_WEB, así que no hay que tocarla al
 * añadir un formulario nuevo — basta con añadir la entrada al mapa.
 */
function construirIndiceWeb() {
  const baseUrl = ScriptApp.getService().getUrl();

  const enlaces = Object.keys(PAGINAS_WEB).map(key => {
    const p = PAGINAS_WEB[key];
    return `<a class="item" href="${baseUrl}?page=${key}" target="_top">
              <span class="icono material-symbols-outlined">${p.icono}</span>
              <span>${p.titulo}</span>
            </a>`;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Gestión Clínica</title>
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL@20..48,300..700,0..1&display=block" rel="stylesheet">
      <style>
        body { font-family: system-ui, sans-serif; background:#f2f5f8; margin:0; padding:2rem 1rem; }
        h1 { font-size:1.25rem; text-align:center; margin-bottom:1.5rem; color:#1b1c1e; }
        .menu { max-width:420px; margin:0 auto; display:flex; flex-direction:column; gap:.75rem; }
        .item {
          display:flex; align-items:center; gap:.75rem;
          background:#fff; border:1px solid #dadfe3; border-radius:16px;
          padding:1rem 1.25rem; text-decoration:none; color:#1b1c1e;
          font-size:1rem; font-weight:500; box-shadow:0 1px 3px rgba(0,0,0,.06);
        }
        .item:active { background:#eaedf1; }
        .icono { font-size:1.5rem; color:#2b5c75; }
      </style>
    </head>
    <body>
      <h1>Gestión Clínica</h1>
      <div class="menu">${enlaces}</div>
    </body>
    </html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle('Gestión Clínica')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
