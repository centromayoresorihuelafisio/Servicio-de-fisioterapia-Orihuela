/**
 * Se activa automáticamente al editar cualquier celda de la hoja de cálculo.
*/
function onEdit(e) {
  if (!e) return; // Evita errores al ejecutar manualmente

  var hoja = e.range.getSheet();
  var fila = e.range.getRow();
  var col = e.range.getColumn();
  var sheetName = hoja.getName();

  // ==========================
  // 1️⃣ Calcular edad según fecha de nacimiento
  // ==========================
  if (fila > 1) { // Saltar encabezados
    var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colNacimiento = encabezados.indexOf("Fecha nacimiento") + 1;
    var colEdad = encabezados.indexOf("Edad") + 1;

    if (colNacimiento !== 0 && colEdad !== 0 && col === colNacimiento) {
      var fechaNacimiento = e.range.getValue();
      var celdaEdad = hoja.getRange(fila, colEdad);

      if (Object.prototype.toString.call(fechaNacimiento) === "[object Date]" && !isNaN(fechaNacimiento)) {
        var hoy = new Date();
        var edad = hoy.getFullYear() - fechaNacimiento.getFullYear();
        if (
          hoy.getMonth() < fechaNacimiento.getMonth() ||
          (hoy.getMonth() === fechaNacimiento.getMonth() && hoy.getDate() < fechaNacimiento.getDate())
        ) {
          edad--;
        }
        celdaEdad.setValue(edad);
      } else {
        celdaEdad.clearContent();
      }
    }
  }

  // ==========================
  // 2️⃣ Buscar teléfono de usuario para la hoja de Agenda
  // ==========================
  if (sheetName.startsWith('Agenda') && col === 4 && e.range.getValue()) { // columna D (asumiendo que la columna Usuario está en D)
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetBD = ss.getSheetByName("Base de Datos Maestra");

    if (!sheetBD) return;

    const dataBD = sheetBD.getRange(2, 2, sheetBD.getLastRow() - 1, 3).getValues(); // rango B:D
    let telefono = '';

    for (let i = 0; i < dataBD.length; i++) {
      if (dataBD[i][0] === e.range.getValue()) { // columna B de BD
        telefono = dataBD[i][2]; // columna D de BD
        break;
      }
    }

    // Poner teléfono en columna E
    if (telefono) {
      hoja.getRange(fila, 5).setValue(telefono);
    } else {
      hoja.getRange(fila, 5).clearContent();
    }
  }

  // ==========================
  // 3️⃣ Ejecutar función adicional del usuario (Inserción de enlace HC)
  // ==========================
  miFuncionAdicional(e);
}

/**
 * Función adicional que contiene la lógica para insertar el enlace de Historia Clínica
 * basada en la celda de 'Usuario' que acaba de ser editada.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e El objeto de evento de edición.
 */
function miFuncionAdicional(e) {
  // Asegurarse de que el evento es válido y no estamos en la fila de encabezados
  if (!e || e.range.getRow() === 1) return;

  const hoja = e.range.getSheet();
  const fila = e.range.getRow();
  const col = e.range.getColumn();
  const sheetName = hoja.getName();
  const nombrePaciente = e.range.getValue() ? e.range.getValue().toString().trim() : '';

  // 1. Validar si es una hoja de Agenda
  if (!sheetName.startsWith("Agenda ")) {
    return; // No hacer nada si no es una hoja de Agenda
  }

  try {
    // Obtener los encabezados para encontrar las columnas 'Usuario' y 'Historia clínica'
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const COL_USUARIO = encabezados.findIndex(h => h.toString().trim() === 'Usuario') + 1;
    const COL_HC_CLINICA = encabezados.findIndex(h => h.toString().trim() === 'Historia clínica') + 1;

    // 2. Validar que la columna editada sea la de 'Usuario' y que las columnas existan
    if (col !== COL_USUARIO || COL_USUARIO === 0 || COL_HC_CLINICA === 0) {
      return;
    }

    // 3. Validar contenido
    if (nombrePaciente === '' || nombrePaciente.startsWith("Turno ")) {
      // Si la celda se vacía o tiene "Turno X", limpiar el enlace
      hoja.getRange(fila, COL_HC_CLINICA).clearContent();
      return;
    }

    // 4. Buscar el URL de la Historia Clínica
    const urlHC = buscarEnlaceHistoriaClinica(nombrePaciente);

    // 5. Insertar el hipervínculo en la columna HC_CLINICA de la misma fila
    const targetRange = hoja.getRange(fila, COL_HC_CLINICA);

    if (urlHC) {
      const emojiEnlace = "📋";
      // Usar la función en inglés 'HYPERLINK' con punto y coma (;) como separador
      const formula = `=HYPERLINK("${urlHC}"; "${emojiEnlace}")`;
      targetRange.setFormula(formula);
    } else {
      targetRange.clearContent();
      Logger.log(`No se encontró HC para el paciente: ${nombrePaciente} (Fila ${fila})`);
    }

  } catch (error) {
    Logger.log("Error en miFuncionAdicional (HC): " + error.message + " Stack: " + error.stack);
  }
}

/**
 * Busca el URL de la historia clínica de un paciente en la 'Base de Datos Maestra'.
 *
 * @param {string} nombrePaciente - El nombre del paciente a buscar.
 * @returns {string | null} El URL de la historia clínica o null si no se encuentra.
 */
function buscarEnlaceHistoriaClinica(nombrePaciente) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMaestra = ss.getSheetByName("Base de Datos Maestra");
  if (!sheetMaestra) {
    // Esto debería generar un error en el onEdit, pero lo manejamos de forma segura.
    Logger.log("Error: No se encontró la hoja 'Base de Datos Maestra'.");
    return null; 
  }

  // Obtener todos los datos y encabezados de la Maestra
  const dataRange = sheetMaestra.getDataRange();
  const values = dataRange.getValues();
  const richTextValues = dataRange.getRichTextValues(); // Necesario para extraer URLs incrustadas

  if (values.length < 1) {
    Logger.log("Base de Datos Maestra está vacía.");
    return null;
  }

  const headersMaestra = values[0].map(h => h.toString().trim());

  // 1. Determinar los índices de columna por nombre (0-based)
  const COL_NOMBRE_MAESTRA = headersMaestra.findIndex(h => h === 'Nombre');
  const COL_ENLACE_HC_MAESTRA = headersMaestra.findIndex(h => h === 'Historia clínica');

  // 2. Validar índices
  if (COL_NOMBRE_MAESTRA === -1 || COL_ENLACE_HC_MAESTRA === -1) {
    Logger.log("Error: No se encontraron las columnas 'Nombre' o 'Historia clínica' en la 'Base de Datos Maestra'.");
    return null;
  }

  // 3. Iterar desde la segunda fila (i = 1) para saltar el encabezado
  for (let i = 1; i < values.length; i++) {
    const nombreEnMaestra = values[i][COL_NOMBRE_MAESTRA] ? values[i][COL_NOMBRE_MAESTRA].toString().trim() : '';

    if (nombreEnMaestra.toLowerCase() === nombrePaciente.toLowerCase()) {
      // 4. Intentar obtener el URL del hipervínculo usando RichTextValue
      const richTextValue = richTextValues[i][COL_ENLACE_HC_MAESTRA];
      const url = richTextValue ? richTextValue.getLinkUrl() : null;

      if (url) {
        return url;
      }

      // 5. Fallback: Si no hay URL enriquecida, intenta ver si es un URL de texto plano
      const textoCelda = values[i][COL_ENLACE_HC_MAESTRA] ? values[i][COL_ENLACE_HC_MAESTRA].toString().trim() : '';
      if (textoCelda.toLowerCase().startsWith('http')) {
        return textoCelda;
      }

      // El nombre coincide, pero la celda de HC está vacía o no es un enlace
      return null;
    }
  }

  // No se encontró al paciente después de iterar
  return null;
}
