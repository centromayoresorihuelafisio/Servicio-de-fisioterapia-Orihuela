// NOTA: parseFecha() se centralizó en Utils.gs (14/07/2026) para eliminar la
// definición duplicada que existía aquí. Ver Utils.gs — misma lógica, fuente única.

/**
 * Calcula el nombre de la hoja de Agenda basándose en el curso académico actual.
 * El curso académico va de Septiembre (mes 8, ya que es 0-indexado) a Agosto (mes 7).
 * @return {string} El nombre de la hoja de Agenda esperado (e.g., "Agenda 2025-2026").
 */
function obtenerNombreHojaAgendaActiva() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0 = Enero, 8 = Septiembre

  let startYear = year;
  let endYear = year + 1;

  // Si el mes es de Septiembre (8) a Diciembre (11), el curso es Year/Year+1
  if (month >= 8) { 
    startYear = year;
    endYear = year + 1;
  } else {
    // Si el mes es de Enero (0) a Agosto (7), el curso es Year-1/Year
    startYear = year - 1;
    endYear = year;
  }

  return `Agenda ${startYear}-${endYear}`;
}

/**
 * Busca, activa y devuelve la hoja de agenda correcta para el curso actual.
 * @return {GoogleAppsScript.Spreadsheet.Sheet|null} La hoja de Agenda activa, o null si no se encuentra.
 */
function navegarYActivarHojaAgenda() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetName = obtenerNombreHojaAgendaActiva();
  
  const sheet = ss.getSheetByName(targetSheetName);

  if (!sheet) {
    // Buscar la hoja activa como alternativa si no se encuentra la del curso
    const activeSheet = ss.getActiveSheet();
    const activeSheetName = activeSheet.getName();

    if (activeSheetName.toLowerCase().includes("agenda")) {
        // Si la hoja activa es una agenda, la usamos (con advertencia)
        ss.toast(`⚠️ Advertencia: No se encontró la hoja "${targetSheetName}". Usando la hoja activa: "${activeSheetName}".`, 'Agenda: Ir a Hoy', 7);
        return activeSheet;
    } else {
        // Si no se encuentra y la activa no es una agenda, se produce un error
        ss.toast(`❌ ERROR: No se encontró la hoja de agenda para el curso actual ("${targetSheetName}") ni la hoja activa contiene "Agenda".`, 'Error de Agenda', 7);
        return null;
    }
  }

  // Activar la hoja correcta si no está activa
  if (ss.getActiveSheet().getName() !== targetSheetName) {
    sheet.activate();
    // Forzar flush para que la activación sea visible si la operación es lenta
    SpreadsheetApp.flush(); 
  }
  return sheet;
}


/**
 * Función principal y unificada de búsqueda y navegación.
 * @param {Date|null} targetDate La fecha de destino normalizada a medianoche. Si es null, usa hoy.
 * @param {boolean} isAutomatic Indica si la función fue llamada por un disparador (para suprimir el toast de éxito).
 */
function buscarYNavegar(targetDate = null, isAutomatic = false) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Navegar y activar la hoja de agenda correcta (o usar la activa como fallback)
  const sheet = navegarYActivarHojaAgenda();
  
  if (!sheet) {
    // El error ya fue reportado por navegarYActivarHojaAgenda
    return;
  }
  
  const sheetName = sheet.getName();

  // Si targetDate es null (llamada desde irAFechaActual), usamos la fecha de hoy.
  const dateToSearch = targetDate || (function() {
    const today = new Date();
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    todayNormalized.setHours(0, 0, 0, 0);
    return todayNormalized;
  })();

  const dateToSearchTime = dateToSearch.getTime();
  
  // *********************************************************
  // ** Buscar en Columna A (Fecha) **
  // *********************************************************
  const dateValues = sheet.getRange("A:A").getValues(); 
  
  let targetRow = -1; // Fila de la coincidencia exacta
  let nearestFutureRow = -1; // Fila de la fecha más cercana en el futuro

  // Empezamos desde la fila 1 (dateValues[0] es el encabezado)
  for (let i = 1; i < dateValues.length; i++) {
    const rowNum = i + 1;
    const cellValue = dateValues[i][0]; 
    
    // Usamos parseFecha para normalizar la fecha de la celda a medianoche.
    const cellDateNormalized = parseFecha(cellValue); 
    
    if (cellDateNormalized) {
      const cellTime = cellDateNormalized.getTime();

      // 1. Prioridad: Coincidencia exacta (la fecha de la celda es la fecha de búsqueda)
      if (cellTime === dateToSearchTime) {
        targetRow = rowNum; 
        break; // Coincidencia exacta encontrada, salimos inmediatamente
      }
      
      // 2. Si no es la fecha de búsqueda y estamos buscando HOY, buscamos el futuro más cercano.
      // Esta lógica solo aplica si estamos buscando la fecha de HOY (targetDate === null).
      if (targetDate === null) {
          const diff = cellTime - dateToSearchTime;

          if (diff > 0) { // Solo consideramos el futuro
            // Como las fechas en la agenda están ordenadas, la primera fecha futura
            // que encontremos es la más cercana al día de HOY.
            if (nearestFutureRow === -1) {
                nearestFutureRow = rowNum;
            }
          }
      }
    }
  }

  // Si se encontró hoy (targetDate === null), se usa targetRow o la fecha futura más cercana.
  // Si se buscó una fecha específica (targetDate !== null), solo se usa targetRow.
  if (targetDate === null) {
      targetRow = targetRow !== -1 ? targetRow : nearestFutureRow;
  }

  if (targetRow !== -1) {
    // **OPTIMIZACIÓN:** Si ya estamos en la fila correcta en la hoja correcta, no hacer nada.
    const activeRange = ss.getActiveRange();
    
    if (activeRange && activeRange.getSheet().getName() === sheetName && activeRange.getRow() === targetRow) {
        if (isAutomatic) {
            return;
        }
    }

    try {
      // Navegamos y activamos la celda A[targetRow]
      const targetCell = sheet.getRange(targetRow, 1); 
      targetCell.activate();
      
      SpreadsheetApp.flush(); // Fuerza la actualización de la interfaz

      // 3. Mostrar SNACKBAR de éxito SOLO si no es una ejecución automática
      if (!isAutomatic) {
        // Leemos de la Columna A y B para mostrar el valor correcto de la fecha
        const fechaEncontrada = sheet.getRange(targetRow, 1).getDisplayValue(); 
        const diaSemana = sheet.getRange(targetRow, 2).getDisplayValue();
        const fechaDisplay = diaSemana ? `${fechaEncontrada} ${diaSemana}` : fechaEncontrada;

        const message = `✅ Navegación exitosa a: ${fechaDisplay} (Fila ${targetRow}) en "${sheetName}".`;
        ss.toast(message, 'Agenda: Ir a Fecha', 7); 
      }

    } catch (e) {
      // Mostrar SNACKBAR para error de navegación
      const errorMessage = `⚠️ ERROR al navegar, pero fecha encontrada en Fila ${targetRow}.`;
      ss.toast(errorMessage, 'Error de Navegación', 7); 
    }
  } else {
    // Si no se encuentra la fecha actual ni ninguna futura
    const dateString = Utilities.formatDate(dateToSearch, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
    ss.toast(`❌ La fecha ${dateString} no se encontró en la hoja "${sheetName}".`, 'Agenda: Ir a Fecha', 7);
  }
}

/**
 * Lógica para la función de navegación a la fecha actual (usa la función unificada).
 * @param {boolean} isAutomatic Indica si la función fue llamada por un disparador.
 */
function irAFechaActual(isAutomatic = false) {
  // Llama a la función unificada sin targetDate (usa el día de hoy)
  buscarYNavegar(null, isAutomatic);
}


/**
 * **NUEVA FUNCIÓN:** Abre el selector de fecha en una ventana de diálogo.
 */
function mostrarSelectorFecha() {
  const html = HtmlService.createTemplateFromFile('Date_Picker_Dialog');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Usamos el formato dd/MM/yyyy para inicializar el calendario en la fecha actual
  const today = new Date();
  html.initialDate = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

  const dialog = html.evaluate()
      .setWidth(300) // Ajustamos el ancho para que quepa bien el calendario
      .setHeight(200)
      .setTitle('Seleccionar Fecha de Destino');

  SpreadsheetApp.getUi().showModalDialog(dialog, 'Seleccionar Fecha de Destino');
}


/**
 * **Callback de la función mostrarSelectorFecha.** * Es llamada por el JavaScript del diálogo HTML cuando el usuario selecciona una fecha.
 * @param {string} dateString La fecha seleccionada en formato yyyy-MM-dd.
 */
function fechaSeleccionada(dateString) {
  if (!dateString) {
    SpreadsheetApp.getUi().alert('Selección de fecha cancelada o inválida.');
    return;
  }
  
  // El input type="date" devuelve yyyy-MM-dd. Lo parseamos para obtener el objeto Date.
  const parts = dateString.split('-'); // [yyyy, MM, dd]
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed month
  const day = parseInt(parts[2], 10);
  
  // Creamos la fecha normalizada a medianoche.
  const targetDate = new Date(year, month, day);
  targetDate.setHours(0, 0, 0, 0);

  // Llamamos a la lógica principal de navegación.
  buscarYNavegar(targetDate, false);
}