// ARCHIVO: WebApp.gs
// Punto de entrada para acceder a formularios desde fuera de la hoja de cálculo.
// Despliegue: Implementar > Nueva implementación > Aplicación web
//   Ejecutar como: Yo
//   Quién tiene acceso: Solo yo
// ================================================================================

// ⚠️ Sustituye esto por el ID real de tu hoja de cálculo.
// Lo encuentras en la URL: https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
const SPREADSHEET_ID = "1D99N_jIQkZwZJ7IM2elk1nLxrIaUJIaSvldUX9yzQ2A";

/**
 * Abre la hoja de cálculo por ID en vez de "la hoja activa".
 * Úsalo en lugar de SpreadsheetApp.getActiveSpreadsheet() en cualquier función
 * que deba poder ejecutarse tanto desde el menú como desde la Web App.
 */
function getSS() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Router de la Web App. Sirve una página HTML distinta según el parámetro ?page=.
 * Sin parámetro, muestra un índice con enlaces a todos los formularios.
 * Añadir un formulario nuevo en el futuro es solo añadir una entrada a este mapa.
 *
 * Ejemplos de URL:
 *   https://script.google.com/macros/s/AAAA.../exec                → índice
 *   https://script.google.com/macros/s/AAAA.../exec?page=citas
 *   https://script.google.com/macros/s/AAAA.../exec?page=nuevoPaciente
 *   https://script.google.com/macros/s/AAAA.../exec?page=valoracion
 */
const PAGINAS_WEB = {
  citas:         { archivo: 'CitaFormulario',              titulo: 'Agenda de Citas',   icono: '📅' },
  nuevoPaciente: { archivo: 'Formulario Añadir Usuario',    titulo: 'Nuevo Paciente',    icono: '🧍' },
  valoracion:    { archivo: 'Valoracion',                   titulo: 'Valoración',        icono: '📋' },
  baseDatos:     { archivo: 'BaseDatosWeb',                 titulo: 'Base de Datos',     icono: '🗂️' },
  agenda:        { archivo: 'AgendaWeb',                    titulo: 'Agenda',            icono: '🗓️' }
};

function doGet(e) {
  const page = e && e.parameter && e.parameter.page;

  // Sin ?page= → índice de navegación
  if (!page) {
    return construirIndiceWeb();
  }

  // Caso especial: edición de un paciente concreto, identificado por su fila
  // real en la Maestra (?page=editarPaciente&fila=N). No es un archivo estático
  // de PAGINAS_WEB porque necesita datos server-side antes de servirse, igual
  // que abrirModalEdicion() desde el menú, pero por número de fila en vez de
  // celda activa (que no existe fuera del editor de la hoja).
  if (page === 'editarPaciente') {
    return servirFormularioEdicionWeb(e.parameter.fila, e.parameter.embed === '1');
  }

  const config = PAGINAS_WEB[page];
  if (!config) {
    return construirIndiceWeb(); // parámetro desconocido → volvemos al índice
  }

  // BaseDatosWeb y AgendaWeb necesitan la URL absoluta de despliegue para
  // abrir ventanas emergentes propias (editar, valoración...) — un href
  // relativo no resuelve bien dentro del iframe en el que Google sirve la
  // Web App.
  if (page === 'baseDatos' || page === 'agenda') {
    const template = HtmlService.createTemplateFromFile(config.archivo);
    template.baseUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
      .setTitle(config.titulo)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // 'citas' y 'valoracion' aceptan un paciente ya elegido desde la tabla de
  // la Base de Datos (?paciente=NOMBRE), para no tener que volver a buscarlo
  // como haría el menú con la fila activa (que no existe en la Web App).
  if (page === 'citas' || page === 'valoracion') {
    const template = HtmlService.createTemplateFromFile(config.archivo);
    template.pacientePreseleccionado = e.parameter.paciente || '';
    return template.evaluate()
      .setTitle(config.titulo)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  return HtmlService.createHtmlOutputFromFile(config.archivo)
    .setTitle(config.titulo)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Sirve FormularioEdicion.html precargado con los datos de la fila indicada,
 * para poder editar un paciente desde la tabla de la Web App sin pasar por
 * el editor de la hoja. Reutiliza exactamente el mismo formulario/lógica de
 * guardado que ya usa el menú 🧍 → Editar.
 */
function servirFormularioEdicionWeb(filaParam, enVentanaEmergente) {
  const rowIdx = parseInt(filaParam, 10);

  if (!rowIdx || rowIdx < 2) {
    return HtmlService.createHtmlOutput('Falta indicar un paciente válido (parámetro "fila"). Vuelve a la <a href="' + ScriptApp.getService().getUrl() + '?page=baseDatos">Base de Datos</a>.');
  }

  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) {
    return HtmlService.createHtmlOutput(`Error: no se encontró la hoja "${SHEETS.MAESTRA}".`);
  }
  if (rowIdx > sheet.getLastRow()) {
    return HtmlService.createHtmlOutput('Ese paciente ya no existe en esa fila. Vuelve a la <a href="' + ScriptApp.getService().getUrl() + '?page=baseDatos">Base de Datos</a> y prueba de nuevo.');
  }

  const { headers, rowData } = prepararDatosFilaParaEdicion(sheet, rowIdx);

  const template = HtmlService.createTemplateFromFile('FormularioEdicion');
  template.headers = headers;
  template.rowData = rowData;
  template.rowIdx = rowIdx;
  template.esWebApp = true;
  template.enVentanaEmergente = !!enVentanaEmergente;
  template.baseUrl = ScriptApp.getService().getUrl();

  return template.evaluate()
    .setTitle('Editar Paciente')
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
              <span class="icono">${p.icono}</span>
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
        .icono { font-size:1.4rem; }
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

/**
 * Versión "web-safe" de obtenerNombreDeFilaActiva: devuelve solo la lista de
 * pacientes (nombre -> teléfono) para el autocompletado, sin intentar leer
 * ninguna fila/celda "activa" (eso no existe fuera del editor de la hoja).
 */
function obtenerListaPacientesWeb() {
  const HOJA_MAESTRA = SHEETS.MAESTRA;
  const COLUMNA_NOMBRE = COLUMNAS_NUM.MAESTRA.NOMBRE;   // Columna B
  const COLUMNA_TELEFONO = COLUMNAS_NUM.MAESTRA.TELEFONO; // Columna D

  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(HOJA_MAESTRA);
    if (!sheet) {
      return { allPatientsData: {}, error: `No se encontró la hoja "${HOJA_MAESTRA}".` };
    }

    const lastRow = sheet.getLastRow();
    const allPatientsData = {};

    if (lastRow > 1) {
      const allData = sheet
        .getRange(2, COLUMNA_NOMBRE, lastRow - 1, COLUMNA_TELEFONO - COLUMNA_NOMBRE + 1)
        .getValues();

      allData.forEach(row => {
        const name = row[0] ? row[0].toString().trim() : '';
        const phone = row[COLUMNA_TELEFONO - COLUMNA_NOMBRE]
          ? row[COLUMNA_TELEFONO - COLUMNA_NOMBRE].toString().trim()
          : '';
        if (name) allPatientsData[name] = phone;
      });
    }

    return { allPatientsData: allPatientsData };
  } catch (e) {
    Logger.log("Error en obtenerListaPacientesWeb: " + e.message);
    return { allPatientsData: {}, error: e.message };
  }
}