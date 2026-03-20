/**
 * Abre la interfaz de usuario para el formulario de valoración.
 * Realiza una validación previa del nombre seleccionado en la celda activa.
 */
function abrirFormularioValoracion() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeCell = ss.getActiveCell();
  const valorSeleccionado = activeCell.getValue();

  // 1. Validar que la celda no esté vacía
  if (!valorSeleccionado) {
    ui.alert('Debe seleccionarse un nombre válido antes de abrir el formulario.');
    return;
  }

  // 2. Obtener los nombres válidos de la columna B de "Base de Datos Maestra"
  const hojaMaestra = ss.getSheetByName("Base de Datos Maestra");
  if (!hojaMaestra) {
    ui.alert('Error: No se encontró la hoja "Base de Datos Maestra".');
    return;
  }

  const nombresValidos = hojaMaestra.getRange("B:B").getValues().flat();

  // 3. Comprobar si el valor existe en la lista de nombres válidos
  if (nombresValidos.indexOf(valorSeleccionado) === -1) {
    ui.alert('Debe seleccionarse un nombre válido antes de abrir el formulario.');
    return;
  }

  // 4. Si es válido, cargar el template y pasar el nombre
  const tmpl = HtmlService.createTemplateFromFile('Valoracion');
  tmpl.nombreUsuario = valorSeleccionado; // Pasamos la variable al HTML

  const html = tmpl.evaluate()
      .setWidth(800)
      .setHeight(800);
      
  ui.showModalDialog(html, ' ');
}

/**
 * Función auxiliar para calcular el promedio de un array de números,
 * ignorando valores no numéricos, vacíos ("") o el valor de "Sin Valorar" (-1).
 */
function calculateAverage(scores) {
  // Convierte los puntajes a números (float), mapeando los valores no válidos a null.
  const validScores = scores
    .map(score => {
      // El cliente JS envía -1 como "" (cadena vacía) o el valor numérico (como cadena).
      if (typeof score === 'string' && score === '') {
        return null; // Tratar como no valorado
      }
      return parseFloat(score);
    })
    // Filtra los valores que resultaron en null o que no son un número válido (NaN).
    .filter(score => score !== null && !isNaN(score));
  
  if (validScores.length === 0) {
    return null; // <--- CAMBIO CLAVE: Devuelve NULL para una celda completamente vacía.
  }
  
  const sum = validScores.reduce((a, b) => a + b, 0);
  // Calcula el promedio y lo redondea a un decimal.
  return Math.round((sum / validScores.length) * 10) / 10;
}