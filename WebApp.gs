// ================================================================================
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
 * Hoy solo tenemos "citas"; añadir más formularios en el futuro es solo
 * añadir una entrada a este mapa.
 *
 * Ejemplo de URL final: https://script.google.com/macros/s/AAAA.../exec?page=citas
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'citas';

  const paginas = {
    citas: 'CitaFormulario'
    // futuros formularios, ej: nuevoPaciente: 'Formulario Añadir Usuario'
  };

  const archivo = paginas[page] || 'CitaFormulario';

  return HtmlService.createHtmlOutputFromFile(archivo)
    .setTitle('Agenda de Citas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

