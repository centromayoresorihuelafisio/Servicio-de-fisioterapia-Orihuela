/**
 * Lee una fila de la Maestra y la deja lista para el formulario de edición
 * (cabeceras + valores, con las fechas convertidas a "yyyy-MM-dd" para que
 * los <input type="date"> las reconozcan). La usa obtenerDatosEdicionPaciente (panel de edición).
 */
function prepararDatosFilaParaEdicion(sheet, rowIdx) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rowData = sheet.getRange(rowIdx, 1, 1, sheet.getLastColumn()).getValues()[0];

  const formattedData = rowData.map((value) => {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    return value;
  });

  return { headers: headers, rowData: formattedData };
}

/**
 * Lee la fila de un usuario de la Maestra para el panel lateral de edición de la Base de Datos Web
 * (usuarios/Panel_Editar.html). Devuelve lo mismo que prepararDatosFilaParaEdicion(). El usuario se localiza por su
 * ID paciente, así que no hay riesgo de editar a otra persona si la hoja se ha reordenado.
 */
function obtenerDatosEdicionPaciente(idPaciente) {
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  const fila = filaMaestraPorId_(sheet, idPaciente);
  if (!fila) throw new Error('Ese usuario ya no está en la Base de Datos. Recarga la página.');
  return prepararDatosFilaParaEdicion(sheet, fila);
}

/**
 * Procesa la actualización de los datos en la hoja de cálculo.
 */
function actualizarPaciente(updatedData, idPaciente) {
  const ss = getSS();
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  // La fila se localiza por el ID paciente (no por un número de fila que pudo cambiar al reordenar).
  const rowIdx = filaMaestraPorId_(sheet, idPaciente);
  if (!rowIdx) throw new Error('Ese usuario ya no está en la Base de Datos. No se ha guardado nada: recarga la página.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Capturamos el Rich Text (hipervínculo) de "Historia clínica" ANTES de
  // tocar la fila. setValues() más abajo aplana toda la fila a texto plano,
  // así que si no lo guardamos aquí y lo restauramos después, el enlace
  // "Ver Historia Clínica" se pierde aunque el texto se conserve.
  const idxHistoria = headers.findIndex(h => h.toLowerCase().includes("historia"));
  const richTextHistoria = idxHistoria !== -1
    ? sheet.getRange(rowIdx, idxHistoria + 1).getRichTextValue()
    : null;

  // Columna "ID paciente" (ID estable, ver COLUMNAS.MAESTRA.ID_PACIENTE): este setValues reescribe la fila
  // ENTERA, así que, si no se conserva aquí, cada edición dejaría el ID en blanco.
  const idxIdPaciente = headers.findIndex(h => h.toString().trim() === COLUMNAS.MAESTRA.ID_PACIENTE);

  const newRowValues = headers.map((header, index) => {
    // Mantener valor original para Nº, ID de paciente e Historia Clínica (seguridad extra)
    if (index === 0 || index === idxIdPaciente || header.toLowerCase().includes("historia")) {
      return sheet.getRange(rowIdx, index + 1).getValue();
    }
    
    let value = updatedData[header];
    
    // Si es una fecha (YYYY-MM-DD), convertir a objeto fecha para Sheets
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parts = value.split('-');
      // Sheets lo interpretará según el formato de la columna de la hoja
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    
    return value || "";
  });
  
  // Formato unificado (core/Utils.gs). El DNI siempre en mayúsculas; el nombre solo se
  // normaliza si se ha modificado, para no reescribir en silencio nombres ya guardados
  // (que podrían estar enlazados por texto con la Agenda o las Historias Clínicas).
  const colNombreIdx = headers.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  const colDniIdx = headers.indexOf(COLUMNAS.MAESTRA.DNI);
  if (colNombreIdx !== -1 || colDniIdx !== -1) {
    const filaActual = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    if (colNombreIdx !== -1) {
      const nombreAntes = (filaActual[colNombreIdx] || '').toString().trim();
      const nombreEnviado = (newRowValues[colNombreIdx] || '').toString().trim();
      if (nombreEnviado !== nombreAntes) {
        const nombreNuevo = normalizarNombreUsuario(nombreEnviado);
        // throw (no return): el formulario trata cualquier respuesta como "guardado" y solo muestra el aviso si hay error
        if (!nombreNuevo) throw new Error('El nombre no puede quedar vacío y solo admite letras y espacios.');
        newRowValues[colNombreIdx] = nombreNuevo;
      }
    }
    if (colDniIdx !== -1) newRowValues[colDniIdx] = normalizarDniUsuario(newRowValues[colDniIdx]);
  }

  // Valores de la fila ANTES de reescribirla, para el historial de Estado/Tipo de Ingreso/Gravedad (sección 11, paso 4).
  const filaAntesHistorial = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];

  sheet.getRange(rowIdx, 1, 1, newRowValues.length).setValues([newRowValues]);

  // Restauramos el hipervínculo que el setValues() de arriba acaba de aplanar.
  if (richTextHistoria) {
    sheet.getRange(rowIdx, idxHistoria + 1).setRichTextValue(richTextHistoria);
  }

  historialRegistrar_(historialCambiosEnFila_(headers, filaAntesHistorial, newRowValues), 'Editar usuario');

  ss.toast("Datos actualizados y guardados en la hoja.", "Éxito ✅", 4);
  return true;
}
