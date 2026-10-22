/** * Obtiene el nombre del usuario (Columna B) y el teléfono (Columna D)
 * de la fila actualmente seleccionada. También carga TODOS los pacientes 
 * de la hoja maestra para rellenar el desplegable.
 */
function obtenerNombreDeFilaActiva() {
  const HOJA_MAESTRA = SHEETS.MAESTRA;
  const COLUMNA_NOMBRE = COLUMNAS_NUM.MAESTRA.NOMBRE;
  const COLUMNA_TELEFONO = COLUMNAS_NUM.MAESTRA.TELEFONO;
  
  try {
    // Lista completa de pacientes: da igual el origen, usamos getSS()
    const ss = getSS();
    const sheet = ss.getSheetByName(HOJA_MAESTRA);
    
    if (!sheet) {
      return { 
        name: "NOT_FOUND", 
        phone: "", 
        error: `Error: No se encontró la hoja llamada "${HOJA_MAESTRA}".`,
        allPatientsData: {} 
      };
    }

    const lastRow = sheet.getLastRow();
    const allPatientsData = {};
    
    if (lastRow > 1) {
        const allDataRange = sheet.getRange(2, COLUMNA_NOMBRE, lastRow - 1, COLUMNA_TELEFONO - COLUMNA_NOMBRE + 1);
        const allData = allDataRange.getValues(); 
        
        allData.forEach(row => {
            const name = row[0] ? row[0].toString().trim() : '';
            const phone = row[COLUMNA_TELEFONO - COLUMNA_NOMBRE] ? row[COLUMNA_TELEFONO - COLUMNA_NOMBRE].toString().trim() : '';
            if (name.length > 0) {
                allPatientsData[name] = phone; 
            }
        });
    }

    // Autorelleno por fila activa: SOLO existe a través de getActiveSpreadsheet(),
    // nunca a través de openById()/getSS(), aunque sea la misma hoja.
    try {
      const activeSS = SpreadsheetApp.getActiveSpreadsheet();
      const activeSheetMaestra = activeSS.getSheetByName(HOJA_MAESTRA);
      const activeRow = activeSheetMaestra.getActiveRange().getRow();

      if (activeRow === 1) {
        return { name: "HEADER_ROW", phone: "", allPatientsData: allPatientsData }; 
      }

      const dataRange = activeSheetMaestra.getRange(activeRow, COLUMNA_NOMBRE, 1, COLUMNA_TELEFONO - COLUMNA_NOMBRE + 1);
      const data = dataRange.getValues()[0]; 
      const nombre = data[0].toString().trim();
      const telefono = (data[COLUMNA_TELEFONO - COLUMNA_NOMBRE] || "").toString().trim();

      if (nombre.length > 0) {
        return { name: nombre, phone: telefono, allPatientsData: allPatientsData };
      }
      return { name: "NOT_FOUND", phone: "", allPatientsData: allPatientsData };

    } catch (innerError) {
      // Sin sesión activa (contexto Web App) → sin autorelleno, con lista completa
      return { name: "NOT_FOUND", phone: "", allPatientsData: allPatientsData };
    }

  } catch (e) {
    Logger.log(`Error en obtenerNombreDeFilaActiva: ${e.message}`);
    return { name: "NOT_FOUND", phone: "", error: `Error de script: ${e.message}`, allPatientsData: {} };
  }
}

/**
 * Semanas, días y huecos libres para el formulario de Cita (agenda/Panel_Cita.html y agenda/Cita_Vista.html).
 * Los huecos se calculan desde la tabla "Citas" (agenda/Web_Escritura_Citas.gs). Si falla, devuelve el aviso dentro de `semanas`
 * para que el formulario lo muestre.
 */
function obtenerSemanasYHuecos() {
  try {
    return obtenerSemanasYHuecosDesdeCitasWeb_();
  } catch (e) {
    console.error(e);
    return { semanas: [{ error: `Error: ${e.message}` }], index: 0 };
  }
}

/**
 * Guarda las citas del formulario de Cita en la tabla "Citas" (agenda/Web_Escritura_Citas.gs): pone al usuario en Activo,
 * lo anota en el historial de Estado y registra el ingreso si es su primera cita.
 */
function guardarCitasMultiples(formData) {
  return guardarCitasMultiplesDesdeCitasWeb_(formData);
}
