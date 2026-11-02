// Punto de entrada para acceder a formularios desde fuera de la hoja de cálculo.
// Despliegue: Implementar > Nueva implementación > Aplicación web
//   Ejecutar como: Yo
//   Quién tiene acceso: Solo yo
// ================================================================================

// ID de la hoja de cálculo. Ahora es solo un RESPALDO: getSS_() usa antes la hoja a la
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
function getSS_() {
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
 * <?!= include_('NombreDeArchivo'); ?> — el "!" es importante: sin él, Apps
 * Script escapa el HTML/CSS/JS inyectado y sale como texto literal en vez
 * de interpretarse. Solo funciona en páginas servidas con
 * HtmlService.createTemplateFromFile(...) (no con createHtmlOutputFromFile).
 */
function include_(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/**
 * Paneles de formulario que las páginas pueden pedir bajo demanda (obtenerPanelWeb_).
 * Solo estos nombres se sirven: la acción se puede pedir desde el navegador.
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
 * Como include_(), pero para un panel de formulario. Con PANELES_BAJO_DEMANDA = true no inyecta el panel:
 * deja un resguardo (ui/JS_Paneles_Diferidos) que lo descargará cuando haga falta. Con false equivale a include_().
 *   <?!= incluirPanel_('valoraciones/Panel_Valoracion', 'PanelValoracion'); ?>
 * @param {string} archivo Ruta del panel, sin extensión.
 * @param {string} global  Nombre del objeto global que define el panel (window.PanelValoracion...).
 */
function incluirPanel_(archivo, global) {
  if (!PANELES_BAJO_DEMANDA) return include_(archivo);
  return '<script>PanelesDiferidos.registrar(' + JSON.stringify(global) + ',' + JSON.stringify(archivo) + ');</script>';
}

/**
 * Entrega a la página los estados, la gravedad y los tipos de ingreso de core/Config.gs (ESTADOS_PACIENTE,
 * GRAVEDAD_PACIENTE, TIPOS_INGRESO) como variables globales del navegador. Se pone UNA vez por página, antes de
 * ui/JS_Ficha y de los paneles que las usan.
 */
function incluirEstados_() {
  return '<script>var ESTADOS_PACIENTE = ' + JSON.stringify(ESTADOS_PACIENTE) + ';' +
    ' var GRAVEDAD_PACIENTE = ' + JSON.stringify(GRAVEDAD_PACIENTE) + ';' +
    ' var TIPOS_INGRESO = ' + JSON.stringify(TIPOS_INGRESO) + ';</script>';
}

/** Devuelve el HTML de un panel (estilos, plantilla y script) para que el navegador lo monte al abrirlo. */
function obtenerPanelWeb_(archivo) {
  if (PANELES_DIFERIDOS_.indexOf(archivo) === -1) throw new Error('Panel no disponible: ' + archivo);
  return include_(archivo);
}

/**
 * Router de la Web App. Sirve una página HTML distinta según el parámetro ?page=.
 * Sin parámetro, o con uno desconocido, sirve Usuarios.
 * Añadir una página nueva es solo añadir una entrada a este mapa.
 *   rol:     el mínimo para verla (sin él, 'usuario'). Solo es comodidad: los datos los protege api() (17.5).
 *   pestana: icono y ayuda de su pestaña en la barra común (ui/Pestanas), en este orden; sin él, no tiene pestaña.
 *
 * Ejemplos de URL:
 *   https://script.google.com/macros/s/AAAA.../exec                → Usuarios
 *   https://script.google.com/macros/s/AAAA.../exec?page=agenda
 */
const PAGINAS_WEB = {
  baseDatos:     { archivo: 'usuarios/BaseDatos_Vista', titulo: 'Usuarios',     pestana: { icono: 'folder_shared', ayuda: 'Ir a Usuarios' } },
  agenda:        { archivo: 'agenda/Web_Vista',         titulo: 'Agenda',       pestana: { icono: 'calendar_month', ayuda: 'Ir a la Agenda' } },
  valoraciones:  { archivo: 'valoraciones/Web_Vista',   titulo: 'Valoraciones', pestana: { icono: 'monitoring', ayuda: 'Ir a Valoraciones' } },
  dashboard:     { archivo: 'dashboard/Web_Vista',      titulo: 'Estadísticas', pestana: { icono: 'dashboard', ayuda: 'Ir a Estadísticas' }, rol: 'administrador' },
  configuracion: { archivo: 'configuracion/Web_Vista',  titulo: 'Configuración', pestana: { icono: 'settings', ayuda: 'Ir a Configuración' }, rol: 'administrador' },
  guiaVisual:    { archivo: 'ui/Guia_Visual',           titulo: 'Guía visual',      rol: 'administrador' },   // banco de pruebas visual (D-V7); sin pestaña
  pruebaAcceso:  { archivo: 'acceso/Prueba_Vista',      titulo: 'Prueba de acceso', rol: 'administrador' }    // comprobación del control de acceso (sección 17); se retira en la fase 5
};

/**
 * Portero común (ui/Acceso) de una página: se pone justo después de abrir body, con la clave de PAGINAS_WEB
 * (o 'hc'). Le pasa la URL de la Web App y el rol mínimo de la página, para volver a Usuarios si no le toca.
 *   <?!= incluirAcceso_('agenda'); ?>
 */
function incluirAcceso_(pagina) {
  const t = HtmlService.createTemplateFromFile('ui/Acceso');
  t.baseUrl = ScriptApp.getService().getUrl();
  t.rolPagina = (PAGINAS_WEB[pagina] && PAGINAS_WEB[pagina].rol) || 'usuario';
  return t.evaluate().getContent();
}

/**
 * Barra de pestañas común (ui/Pestanas), con la de la página marcada y el menú de sesión. Va justo después del portero.
 *   <?!= incluirPestanas_('agenda'); ?>
 */
function incluirPestanas_(pagina) {
  const t = HtmlService.createTemplateFromFile('ui/Pestanas');
  const baseUrl = ScriptApp.getService().getUrl();
  t.pestanas = Object.keys(PAGINAS_WEB).filter(k => PAGINAS_WEB[k].pestana).map(k => {
    const p = PAGINAS_WEB[k];
    return { url: baseUrl + '?page=' + k, titulo: p.titulo, icono: p.pestana.icono, ayuda: p.pestana.ayuda,
      activo: k === pagina ? 'activo' : '', rol: p.rol || 'usuario' };
  });
  return t.evaluate().getContent();
}

function doGet(e) {
  // Plan de emergencia, nivel 3 (CONTEXTO.md, 17.9): con la app cerrada solo se ve un aviso. Se reabre desde el editor.
  if (accesoInterruptores_().cerrada) {
    const aviso = HtmlService.createTemplateFromFile('acceso/Cerrada_Vista');
    aviso.mensaje = APP_CERRADA_MSG_;
    return aviso.evaluate().setTitle('Aplicación cerrada').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const pedida = (e && e.parameter && e.parameter.page) || 'baseDatos';

  // Caso especial: ficha de historia clínica en HTML (?page=hc&id=ID_HC o &idPaciente=ID_PACIENTE).
  if (pedida === 'hc') {
    return servirFichaHCWeb_(e.parameter);
  }

  // Ninguna página lleva datos de usuarios: los pide después por api(), que exige sesión (17.5).
  const config = PAGINAS_WEB[pedida] || PAGINAS_WEB.baseDatos;

  // Las páginas necesitan la URL absoluta de despliegue para abrir ventanas propias (la HC) y para los
  // enlaces de las pestañas: un href relativo no resuelve bien dentro del iframe en el que Google sirve la Web App.
  const template = HtmlService.createTemplateFromFile(config.archivo);
  template.baseUrl = ScriptApp.getService().getUrl();
  return template.evaluate()
    .setTitle(config.titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}