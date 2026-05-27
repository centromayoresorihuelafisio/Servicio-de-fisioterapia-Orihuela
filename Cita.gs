/** * Obtiene el nombre del usuario (Columna B) y el teléfono (Columna D)
 * de la fila actualmente seleccionada. También carga TODOS los pacientes 
 * de la hoja maestra para rellenar el desplegable.
 */
function obtenerNombreDeFilaActiva() {
  const HOJA_MAESTRA = "Base de Datos Maestra";
  
  // Confirma que las columnas son B (2) para Nombre y D (4) para Teléfono
  const COLUMNA_NOMBRE = 2; 
  const COLUMNA_TELEFONO = 4; 
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(HOJA_MAESTRA);
    
    if (!sheet) {
      return { 
        name: "NOT_FOUND", 
        phone: "", 
        error: `Error: No se encontró la hoja llamada "${HOJA_MAESTRA}".`,
        allPatientsData: {} 
      };
    }

    // 1. --- Lógica para obtener TODOS los pacientes y sus teléfonos ---
    const lastRow = sheet.getLastRow();
    const allPatientsData = {}; // Mapa: Nombre -> Teléfono
    
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
        // 2. --- Lógica para obtener el paciente de la fila activa ---
    const activeRow = sheet.getActiveRange().getRow();

    if (activeRow === 1) {
      return { name: "HEADER_ROW", phone: "", allPatientsData: allPatientsData }; 
    }

    const dataRange = sheet.getRange(activeRow, COLUMNA_NOMBRE, 1, COLUMNA_TELEFONO - COLUMNA_NOMBRE + 1);
    const data = dataRange.getValues()[0]; 

    const nombre = data[0].toString().trim();
    const telefono = (data[COLUMNA_TELEFONO - COLUMNA_NOMBRE] || "").toString().trim();

    if (nombre.length > 0) {
      return { name: nombre, phone: telefono, allPatientsData: allPatientsData };
    } else {
      return { name: "NOT_FOUND", phone: "", allPatientsData: allPatientsData };
    }

  } catch (e) {
    Logger.log(`Error en obtenerNombreDeFilaActiva: ${e.message}`);
    return { name: "NOT_FOUND", phone: "", error: `Error de script: ${e.message}`, allPatientsData: {} };
  }
}

/**
 * Configuración de la Agenda
 */
const NOMBRE_HOJA_AGENDA = "Agenda 2025-2026"; 
const COLUMNA_USUARIO = 4; // Columna D (Nombre del paciente en Agenda)
const COLUMNA_TELEFONO_AGENDA = 5; // Columna E (Teléfono en Agenda)
const COLUMNA_SESION = 6;  // Columna F (Nº Sesión en Agenda)
const COLUMNA_NOTAS = 10;  // Columna J (Notas en Agenda)
const COLUMNA_HC_AGENDA = 9; // Columna I (Historia Clínica en Agenda - Ajustar si es otra)
const NUM_SEMANAS_A_CARGAR = 49; 

const HOJA_MAESTRA_NOMBRE = "Base de Datos Maestra";
const COLUMNA_NOMBRE_MAESTRA = 2; // Columna B
const COLUMNA_ESTADO_MAESTRA = 8; // Columna H

/**
 * Muestra el diálogo modal con el formulario HTML.
 */
function mostrarDialogoCita() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('CitaFormulario') 
        .setWidth(800) 
        .setHeight(650); 
    SpreadsheetApp.getUi().showModalDialog(html, '\u200B');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Error al mostrar el diálogo: ' + e.toString());
  }
}

function formatFecha(dateValue) {
  if (dateValue instanceof Date) {
    const day = String(dateValue.getDate()).padStart(2, '0');
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const year = dateValue.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return '';
}

function getTodayKey(timeZone) {
    const today = new Date();
    return Utilities.formatDate(today, timeZone, 'dd/MM/yyyy'); 
}

function obtenerHojaAgenda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12

  let cursoInicio, cursoFin;

  if (month >= 9) { // Septiembre - Diciembre
    cursoInicio = today.getFullYear();
    cursoFin = cursoInicio + 1;
  } else { // Enero - Julio
    cursoFin = today.getFullYear();
    cursoInicio = cursoFin - 1;
  }

  const regex = new RegExp(`^Agenda\\s+${cursoInicio}-${cursoFin}$`);

  for (let i = 0; i < sheets.length; i++) {
    if (regex.test(sheets[i].getName())) {
      return sheets[i];
    }
  }

  throw new Error(`No se encontró una hoja de Agenda para el curso ${cursoInicio}-${cursoFin}.`);
}
/**
 * Lee la agenda y extrae las semanas, días y huecos disponibles.
 * VERSIÓN 11.2: Detección ultra-robusta de huecos vacíos.
 */
function obtenerSemanasYHuecos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Usamos la constante o el nombre directo
    const sheet = obtenerHojaAgenda();

    const timeZone = ss.getSpreadsheetTimeZone();
    const data = sheet.getDataRange().getValues();
    const NUM_SEMANAS_A_CARGAR = 60; // Ajusta según necesites

    const semanasData = [];
    let currentWeek = null;
    let currentDay = null;
    let semanaCounter = 0;
    let weekLabel = null;
    let currentDateKey = null;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row[0] && !row[2]) continue;

      // --- 1. DETECCIÓN DE ETIQUETA DE SEMANA ---
      const cellC_text = row[2] ? row[2].toString().trim().toUpperCase() : "";
      if (cellC_text.startsWith('SEMANA')) {
        weekLabel = row[2].toString().trim();
        continue; // Saltamos a la siguiente fila para buscar el lunes
      }

      // --- 2. DETECCIÓN DE ENCABEZADO DE DÍA ---
      // Si la columna A es fecha y la B tiene el nombre del día
      if (row[0] instanceof Date && row[1] && cellC_text === "") {
        currentDateKey = Utilities.formatDate(row[0], timeZone, "dd/MM/yyyy");
        const dayName = row[1].toString().trim();
        const dayLabel = `${dayName} ${currentDateKey}`;

        // Lógica de cambio de semana (Suele ser los Lunes)
        if (dayName === 'Lunes' || currentWeek === null) {
          if (semanaCounter >= NUM_SEMANAS_A_CARGAR) break;
          
          currentWeek = {
            label: weekLabel || `Semana ${semanaCounter + 1}`,
            dias: {}
          };
          semanasData.push(currentWeek);
          semanaCounter++;
          weekLabel = null; // Reset para la siguiente
        }

        currentDay = { label: dayLabel, huecos: [] };
        currentWeek.dias[currentDateKey] = currentDay;
        continue;
      }

      // --- 3. DETECCIÓN DE SLOT REAL (row[2] es Date) ---
      if (row[2] instanceof Date) {
        // Limpieza extrema del nombre de usuario en columna D
        // Eliminamos espacios, saltos de línea y caracteres no imprimibles
        const usuarioRaw = row[3] ? row[3].toString() : "";
        const usuarioLimpio = usuarioRaw.replace(/[\s\uFEFF\xA0]/g, '');

        // Si el usuario está realmente vacío
        if (usuarioLimpio === "") {
          if (!currentDay) continue; // Seguridad

          const horaDisplay = Utilities.formatDate(row[2], timeZone, 'HH:mm');
          const rowNumber = i + 1;

          const huecoValue = JSON.stringify({
            row: rowNumber,
            date: currentDateKey,
            time: horaDisplay
          });

          currentDay.huecos.push({
            hora: horaDisplay,
            value: huecoValue
          });
        }
      }
    }

    // Calculamos el index de la semana actual para el formulario
    const todayKey = Utilities.formatDate(new Date(), timeZone, "dd/MM/yyyy");
    let currentWeekIndexToStart = 0;
    for (let i = 0; i < semanasData.length; i++) {
      if (semanasData[i].dias[todayKey]) {
        currentWeekIndexToStart = i;
        break;
      }
    }

    return { 
      semanas: semanasData.filter(s => Object.keys(s.dias).length > 0), 
      index: currentWeekIndexToStart 
    };

  } catch (e) {
    console.error(e);
    return { semanas: [{ error: `Error: ${e.message}` }], index: 0 };
  }
}

function actualizarEstadoPaciente(userName, newStatus) {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(HOJA_MAESTRA_NOMBRE);
        if (!sheet) return false;

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return false;

        const names = sheet.getRange(2, COLUMNA_NOMBRE_MAESTRA, lastRow - 1, 1).getValues();
        let targetRow = -1;

        for (let i = 0; i < names.length; i++) {
            if (names[i][0].toString().trim() === userName.trim()) {
                targetRow = i + 2; 
                break;
            }
        }

        if (targetRow > 0) {
            sheet.getRange(targetRow, COLUMNA_ESTADO_MAESTRA).setValue(newStatus);
            return true;
        }
        return false;
    } catch (e) {
        Logger.log(e.message);
        return false;
    }
}

/**
 * Guarda múltiples citas e inserta automáticamente el enlace de la Historia Clínica.
 */
function guardarCitasMultiples(formData) {
  const { nombreUsuario, telefonoUsuario, huecosJson, numSesion, notas } = formData;
  
  if (!huecosJson || huecosJson.length === 0) {
    return { success: false, message: "No se seleccionó ningún hueco." };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(NOMBRE_HOJA_AGENDA);
  
  if (!sheet) {
    return { success: false, message: "No se encontró la hoja de Agenda." };
  }
  
  // CARGA ÚNICA DE HISTORIAS CLÍNICAS EN MEMORIA
  const mapaHistorias = cargarMapaHistoriasClinicas(ss);

  let successCount = 0;
  let failureMessages = [];
  let huecosObjs = huecosJson.map(jsonStr => JSON.parse(jsonStr));
  huecosObjs.sort((a, b) => a.row - b.row);

  let sessionBase = parseInt(numSesion, 10);
  const isNumericSession = !isNaN(sessionBase) && String(sessionBase) === String(numSesion).trim(); 
  
  huecosObjs.forEach((hueco, index) => {
    try {
      const targetRow = hueco.row;
      let sessionToWrite = isNumericSession ? String(sessionBase + index) : numSesion; 

      const rangeFull = sheet.getRange(targetRow, COLUMNA_USUARIO, 1, COLUMNA_NOTAS - COLUMNA_USUARIO + 1);
      const existingUser = rangeFull.getCell(1, 1).getValue().toString().trim();
      
      if (existingUser.length > 0) {
        failureMessages.push(`Colisión en fila ${targetRow}.`);
        return;
      }
      
      // Escritura de datos básicos
      const valuesToWrite = [[nombreUsuario, telefonoUsuario, sessionToWrite, '', '', '', notas]];
      rangeFull.setValues(valuesToWrite);

      // INSERCIÓN AUTOMÁTICA DEL ENLACE HC
      const enlaceInfo = mapaHistorias ? mapaHistorias[nombreUsuario.toLowerCase()] : null;
      if (enlaceInfo) {
        const richTextValue = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(enlaceInfo.url)
          .build();
        sheet.getRange(targetRow, COLUMNA_HC_AGENDA).setRichTextValue(richTextValue);
      }
      
      successCount++;
    } catch (e) {
      failureMessages.push(`Error fila ${hueco.row}: ${e.message}`);
    }
  });
  
  if (successCount > 0) {
    actualizarEstadoPaciente(nombreUsuario, "🟢 Activo");

    ordenarPacientes();
    
    let message = `Registro exitoso de **${successCount}** cita(s).`;
    message += `<br>Estado de **${nombreUsuario}** actualizado a **🟢 Activo** e Historia Clínica vinculada.`;
    return { success: true, message: message };
  } else {
    return { success: false, message: "No se pudo guardar ninguna cita: " + failureMessages.join('; ') };
  }
}

/**
 * Inserta manualmente enlaces de HC en las filas seleccionadas de la Agenda.
 */
function insertarEnlaceHistoriaClinica() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const sheetAgenda = ss.getActiveSheet();
    if (!sheetAgenda.getName().startsWith("Agenda ")) {
      ui.alert("Solo válido en hojas de Agenda.");
      return;
    }

    const activeRange = sheetAgenda.getActiveRange(); 
    const mapaHistorias = cargarMapaHistoriasClinicas(ss);
    if (!mapaHistorias) return;

    const startRow = activeRange.getRow();
    const numRows = activeRange.getNumRows();
    let enlacesInsertados = 0;

    for (let i = 0; i < numRows; i++) {
      const currentRow = startRow + i;
      const nombrePaciente = sheetAgenda.getRange(currentRow, COLUMNA_USUARIO).getValue().toString().trim();
      if (!nombrePaciente) continue;

      const enlaceInfo = mapaHistorias[nombrePaciente.toLowerCase()];
      if (enlaceInfo) {
        const richTextValue = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(enlaceInfo.url)
          .build();
        sheetAgenda.getRange(currentRow, COLUMNA_HC_AGENDA).setRichTextValue(richTextValue);
        enlacesInsertados++;
      }
    }
    if (enlacesInsertados > 0) ss.toast(`${enlacesInsertados} enlaces insertados.`);
  } catch (e) { ui.alert(e.message); }
}

/**
 * Carga el mapa de Historias Clínicas desde la Base de Datos Maestra.
 */
function cargarMapaHistoriasClinicas(ss) {
  const sheetMaestra = ss.getSheetByName(HOJA_MAESTRA_NOMBRE);
  if (!sheetMaestra) return null;

  const dataRange = sheetMaestra.getDataRange();
  const values = dataRange.getValues();
  const richTextValues = dataRange.getRichTextValues(); 
  
  if (values.length < 2) return null; 
  
  const headers = values[0].map(h => h.toString().trim());
  const colNombre = headers.indexOf('Nombre');
  const colHC = headers.indexOf('Historia clínica');

  if (colNombre === -1 || colHC === -1) return null;

  const mapa = {};
  for (let i = 1; i < values.length; i++) {
    const nombre = values[i][colNombre] ? values[i][colNombre].toString().trim() : '';
    if (!nombre) continue;

    const richTextCell = richTextValues[i][colHC];
    let url = richTextCell.getLinkUrl();

    if (!url) {
      const cellValue = values[i][colHC] ? values[i][colHC].toString().trim() : '';
      if (cellValue.toLowerCase().startsWith("http")) url = cellValue;
    }

    if (url) mapa[nombre.toLowerCase()] = { url: url };
  }
  return mapa;
}