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
 * Configuración de la Agenda
 * NOTA: el nombre de la hoja de agenda del curso actual ya NO se guarda aquí
 * como texto fijo (eso causaba que dejara de encontrarla en cuanto cambiaba
 * el curso). Se calcula dinámicamente con obtenerHojaAgenda() (core/Utils.gs).
 */
const NUM_SEMANAS_A_CARGAR = 49; 

/**
 * Muestra el diálogo modal con el formulario HTML.
 * IMPORTANTE: usa createTemplateFromFile + evaluate() (no
 * createHtmlOutputFromFile) porque agenda/Cita_Vista.html contiene una
 * scriptlet (<?!= ... ?>) para precargar PACIENTE_PRESELECCIONADO. Con
 * createHtmlOutputFromFile esa scriptlet no se evalúa, llega tal cual al
 * navegador como JavaScript inválido, y rompe TODO el <script> del
 * formulario antes de que llegue a pedir el paciente o la agenda.
 */
function mostrarDialogoCita() {
  try {
    const template = HtmlService.createTemplateFromFile('agenda/Cita_Vista');
    template.pacientePreseleccionado = ''; // desde el menú de Sheets no aplica
    prepararContexto_(template, 'dialogo');
    const html = template.evaluate()
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


/**
 * Lee la agenda y extrae las semanas, días y huecos disponibles.
 * VERSIÓN 11.2: Detección ultra-robusta de huecos vacíos.
 */
function obtenerSemanasYHuecos() {
  try {
    const ss = getSS();
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
        const ss = getSS();
        const sheet = ss.getSheetByName(SHEETS.MAESTRA);
        if (!sheet) return false;

        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return false;

        const names = sheet.getRange(2, COLUMNAS_NUM.MAESTRA.NOMBRE, lastRow - 1, 1).getValues();
        let targetRow = -1;

        for (let i = 0; i < names.length; i++) {
            if (names[i][0].toString().trim() === userName.trim()) {
                targetRow = i + 2; 
                break;
            }
        }

        if (targetRow > 0) {
            sheet.getRange(targetRow, COLUMNAS_NUM.MAESTRA.ESTADO).setValue(newStatus);
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

  const ss = getSS();
  let sheet;
  try {
    sheet = obtenerHojaAgenda(); // hoja del curso actual, calculada dinámicamente
  } catch (e) {
    return { success: false, message: e.message };
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

      const rangeFull = sheet.getRange(targetRow, COLUMNAS_NUM.AGENDA.USUARIO, 1, COLUMNAS_NUM.AGENDA.NOTAS - COLUMNAS_NUM.AGENDA.USUARIO + 1);
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
        sheet.getRange(targetRow, COLUMNAS_NUM.AGENDA.HISTORIA_CLINICA).setRichTextValue(richTextValue);
      }
      
      successCount++;
    } catch (e) {
      failureMessages.push(`Error fila ${hueco.row}: ${e.message}`);
    }
  });
  
  if (successCount > 0) {
    actualizarEstadoPaciente(nombreUsuario, "🟢 Activo");

    ordenarPacientes();
    invalidarCacheAgenda_(sheet); // sin esto, agenda/Web.gs sirve la semana cacheada (hasta 90s) aunque el sondeo del cliente pregunte al instante

    let message = `Registro exitoso de **${successCount}** cita(s).`;
    message += `<br>Estado de **${nombreUsuario}** actualizado a **🟢 Activo** e Historia Clínica vinculada.`;
    return { success: true, message: message };
  } else {
    return { success: false, message: "No se pudo guardar ninguna cita: " + failureMessages.join('; ') };
  }
}
