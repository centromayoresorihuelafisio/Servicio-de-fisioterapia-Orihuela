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
    SpreadsheetApp.getUi().showModalDialog(html, 'Registro de Citas');
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

function obtenerSemanasYHuecos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(NOMBRE_HOJA_AGENDA);

    if (!sheet) {
      return { semanas: [{ error: `Hoja '${NOMBRE_HOJA_AGENDA}' no encontrada.` }], index: 0 };
    }
    
    const timeZone = ss.getSpreadsheetTimeZone(); 
    const todayKey = getTodayKey(timeZone); 
    let currentWeekIndexToStart = 0; 
    let currentDateKey = null;

    const data = sheet.getRange('A1:J5000').getValues();
    const semanasData = [];
    let currentWeek = null;
    let currentDay = null;
    let semanaCounter = 0;
    let weekLabel = null;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const cellA = row[0].toString().trim();
      if (cellA.startsWith('Semana') && currentWeek) {
          weekLabel = cellA; 
      }
      
      if (row[0] instanceof Date && row[1]) {
        currentDateKey = formatFecha(row[0]); 
        const dateKey = currentDateKey; 
        const dayLabel = `${row[1]} ${dateKey}`; 

        if (currentWeek === null || !currentWeek.dias[dateKey]) {
            if (currentDay && currentWeek) {
                const previousDateKey = formatFecha(data[i - 1][0]);
                if (previousDateKey) {
                    currentWeek.dias[previousDateKey] = currentDay;
                }
            }
            
            if (row[1].toString().trim() === 'Lunes' || currentWeek === null) {
              if (semanaCounter >= NUM_SEMANAS_A_CARGAR) break; 
              
              if (currentWeek !== null) {
                  semanasData.push(currentWeek); 
                  semanaCounter++;
              }
              
              currentWeek = {
                  label: weekLabel || `Semana ${semanaCounter + 1}`,
                  dias: {}
              };
            }
        }
        
        currentDay = { label: dayLabel, huecos: [] };
        currentWeek.dias[dateKey] = currentDay;
        
      } else if (currentDay && row[2]) {
        let horaDisplay = '';
        const rawHoraValue = row[2];
        const usuario = row[3].toString().trim(); 
        
        if (rawHoraValue instanceof Date) {
            horaDisplay = Utilities.formatDate(rawHoraValue, timeZone, 'HH:mm');
        } else {
            horaDisplay = rawHoraValue.toString().trim();
        }

        if (usuario === '' && horaDisplay) {
          const rowNumber = i + 1;
          const fechaKey = currentDateKey; 
          const huecoValue = JSON.stringify({ 
              row: rowNumber, 
              date: fechaKey, 
              time: horaDisplay 
          });

          currentDay.huecos.push({
            hora: horaDisplay,
            value: huecoValue
          });
        }
      }
    }
    
    if (currentWeek && semanaCounter < NUM_SEMANAS_A_CARGAR) {
        semanasData.push(currentWeek);
    }

    for (let i = 0; i < semanasData.length; i++) {
        const week = semanasData[i];
        if (week.dias && week.dias[todayKey]) {
            currentWeekIndexToStart = i;
            break; 
        }
    }

    return { semanas: semanasData, index: currentWeekIndexToStart };

  } catch (e) {
    Logger.log(e);
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
    actualizarEstadoPaciente(nombreUsuario, "🟢 Activo ");
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