// ================================================================================
// ARCHIVO: Base de Datos Web.gs
// Alimenta la tabla de pacientes de la Web App (?page=baseDatos): una vista de
// solo lectura de TODA la Maestra con todas sus columnas, para poder consultar
// la base de datos sin abrir la hoja de cálculo. La edición de cada paciente
// se hace desde ahí mismo, con un enlace a ?page=editarPaciente&fila=N que
// reutiliza el mismo FormularioEdicion.html que ya usa el menú 🧍 → Editar.
// ================================================================================

/**
 * Devuelve todas las filas de la Maestra (todas las columnas, tal cual están
 * en la hoja) para renderizar la tabla completa en la Web App.
 * Cada paciente incluye `_fila`: el número de fila real en la hoja, necesario
 * para poder editarlo después con actualizarPaciente(datos, _fila).
 */
function obtenerBaseDatosCompletaWeb() {
  try {
    const ss = getSS();
    const sheet = ss.getSheetByName(SHEETS.MAESTRA);
    if (!sheet) {
      return { headers: [], pacientes: [], error: `No se encontró la hoja "${SHEETS.MAESTRA}".` };
    }

    const lastRow = sheet.getLastRow();
    const lastColRaw = sheet.getLastColumn();
    const headersRaw = sheet.getRange(1, 1, 1, lastColRaw).getValues()[0];

    // La hoja suele tener columnas con formato pero sin cabecera al final
    // (celdas de formato heredado, sin dato real) — nos quedamos solo con
    // las columnas hasta la última que sí tiene nombre.
    let lastCol = 0;
    headersRaw.forEach((h, idx) => { if (h && h.toString().trim() !== '') lastCol = idx + 1; });
    const headers = headersRaw.slice(0, lastCol).map(h => h.toString().trim());

    if (lastRow < 2 || lastCol === 0) {
      return { headers: headers, pacientes: [] };
    }

    const rango = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = rango.getValues();
    const richTextData = rango.getRichTextValues();
    const colHC = headers.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

    const pacientes = data
      .map((row, i) => {
        const paciente = { _fila: i + 2 };
        headers.forEach((h, colIdx) => {
          let value = row[colIdx];

          if (colIdx === colHC) {
            // La celda de Historia Clínica es un enlace enriquecido: el texto
            // visible es "Ver Historia Clínica", la URL real va aparte.
            const richTextCell = richTextData[i][colIdx];
            const url = richTextCell ? richTextCell.getLinkUrl() : null;
            value = url || (value ? value.toString().trim() : '');
          } else if (Object.prototype.toString.call(value) === '[object Date]') {
            value = Utilities.formatDate(value, Session.getScriptTimeZone(), "dd/MM/yyyy");
          }

          paciente[h] = value;
        });
        return paciente;
      })
      // Ignorar filas completamente vacías (huecos en la hoja)
      .filter(p => p[COLUMNAS.MAESTRA.NOMBRE] && p[COLUMNAS.MAESTRA.NOMBRE].toString().trim() !== '');

    return { headers: headers, pacientes: pacientes };
  } catch (e) {
    Logger.log("Error en obtenerBaseDatosCompletaWeb: " + e.message);
    return { headers: [], pacientes: [], error: e.message };
  }
}