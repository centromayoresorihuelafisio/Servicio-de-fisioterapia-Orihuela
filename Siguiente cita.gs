/**
 * Copia los datos de la cita seleccionada (en la columna 'Usuario')
 * al día correspondiente de la siguiente semana alterna,
 * manteniendo la hora y el patrón L-M / M-J, incluyendo Viernes a Viernes (+7 días).
 * * MEJORA SCRIPTOR MASTER: Ahora utiliza getRichTextValue() para preservar 
 * hipervínculos en la columna "Historia clínica".
 */
function copiarSiguienteCita() {
  // Configuración de la aplicación
  const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
  const UI = SpreadsheetApp.getUi();

  // --- MODIFICACIÓN: Usar la hoja activa y validar el nombre ---
  const AGENDA_SHEET = SPREADSHEET.getActiveSheet();
  const SHEET_NAME = AGENDA_SHEET.getName();
  
  // Comprobar que la hoja activa contenga "Agenda" en el nombre (insensible a mayúsculas)
  if (SHEET_NAME.toLowerCase().indexOf('agenda') === -1) {
    UI.alert('Error: La hoja activa ("' + SHEET_NAME + '") debe contener la palabra "Agenda" para ejecutar esta función.');
    return;
  }
  
  // --- FIX CRÍTICO: Manejo de selecciones múltiples ---
  const SELECTION_OBJECT = SPREADSHEET.getSelection();
  const ACTIVE_RANGE_LIST = SELECTION_OBJECT.getActiveRangeList();
  
  if (!ACTIVE_RANGE_LIST) {
    UI.alert('❌ Error de Selección: Debe seleccionar una o más celdas de usuario para copiar citas.');
    return;
  }

  const SELECTED_RANGES = ACTIVE_RANGE_LIST.getRanges(); 
  
  // Definición de índices de columnas (A=1, B=2, C=3, D=4, E=5, F=6, I=9, J=10)
  const COL_INDEX = {
    DATE: 1, // Columna A
    DAY: 2,  // Columna B
    TIME: 3, // Columna C
    USER: 4, // Columna D
    PHONE: 5, // Columna E
    SESSION: 6, // Columna F
    CLINIC_HISTORY: 9, // Columna I
    NOTES: 10 // Columna J
  };
  
  // Obtenemos todos los datos para lectura rápida (excepto los enriquecidos)
  const ALL_VALUES = AGENDA_SHEET.getDataRange().getValues();
  const HEADER_ROWS_COUNT = 3; 
  let successCount = 0;
  let errorMessages = [];

  // --- LÓGICA DE ITERACIÓN PARA RANGOS MÚLTIPLES ---
  for (const selection of SELECTED_RANGES) {
    // Validación de columna de selección (Debe ser Columna D)
    if (selection.getColumn() !== COL_INDEX.USER) { 
      errorMessages.push(`❌ Error: El rango [${selection.getA1Notation()}] no está en la columna "Usuario" (Columna D) y ha sido ignorado.`);
      continue;
    }
    
    // Iterar sobre cada fila dentro del rango actual
    for (let i = 0; i < selection.getNumRows(); i++) {
        
      const ROW_NUM = selection.getRow() + i; 
      const ARRAY_INDEX = ROW_NUM - 1; 
       
      if (ARRAY_INDEX < HEADER_ROWS_COUNT || ARRAY_INDEX >= ALL_VALUES.length) {
        continue;
      }

      const SOURCE_ROW_VALUES = ALL_VALUES[ARRAY_INDEX]; 
      const USER_NAME = SOURCE_ROW_VALUES[COL_INDEX.USER - 1];
      
      if (!USER_NAME || typeof USER_NAME !== 'string' || USER_NAME.startsWith('🟡') || USER_NAME.startsWith('🟠')) {
        continue;
      }

      // --- 1. Determinar la Fecha de la Cita Origen ---
      let SOURCE_DATE = SOURCE_ROW_VALUES[COL_INDEX.DATE - 1];
      let sourceDateObj = null;

      if (!(SOURCE_DATE instanceof Date)) {
        for (let r = ARRAY_INDEX; r >= HEADER_ROWS_COUNT; r--) {
          let tempDate = ALL_VALUES[r][COL_INDEX.DATE - 1];
          if (tempDate instanceof Date) {
            sourceDateObj = tempDate;
            break;
          }
        }
      } else {
        sourceDateObj = SOURCE_DATE;
      }

      if (!sourceDateObj) {
        errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): No se pudo determinar la fecha origen.`);
        continue;
      }

      // --- 2. Preparar datos de origen ---
      const SOURCE_TIME_STR = SOURCE_ROW_VALUES[COL_INDEX.TIME - 1];
      const PHONE = SOURCE_ROW_VALUES[COL_INDEX.PHONE - 1];
      let sessionValue = SOURCE_ROW_VALUES[COL_INDEX.SESSION - 1];
      const NOTES = SOURCE_ROW_VALUES[COL_INDEX.NOTES - 1];
      
      /** * MODIFICACIÓN MAESTRA:
       * Obtenemos el RichTextValue de la Historia Clínica para no perder el link.
       */
      const SOURCE_CLINIC_HISTORY_RANGE = AGENDA_SHEET.getRange(ROW_NUM, COL_INDEX.CLINIC_HISTORY);
      const CLINIC_HISTORY_RT = SOURCE_CLINIC_HISTORY_RANGE.getRichTextValue();
      
      // Cálculo de sesión
      let currentSessionNumber = 0;
      if (typeof sessionValue === 'number' && sessionValue >= 1) {
        currentSessionNumber = sessionValue;
      } else if (typeof sessionValue === 'string' && sessionValue !== '') {
        currentSessionNumber = parseInt(sessionValue, 10);
        if (isNaN(currentSessionNumber) || currentSessionNumber < 1) currentSessionNumber = 0;
      }
      const nextSession = currentSessionNumber + 1; 
      
      // --- 3. Calcular fecha destino ---
      let daysToAdd = 0;
      const dayOfWeek = sourceDateObj.getDay(); 
      
      if (dayOfWeek === 1 || dayOfWeek === 2) { // Lun/Mar -> +2
        daysToAdd = 2;
      } else if (dayOfWeek === 3 || dayOfWeek === 4) { // Mie/Jue -> +5
        daysToAdd = 5;
      } else if (dayOfWeek === 5) { // Vie -> +7
        daysToAdd = 7;
      } else {
        errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): Día no válido (${dayOfWeek}).`);
        continue;
      }
      
      const NEXT_DATE = new Date(sourceDateObj);
      NEXT_DATE.setDate(sourceDateObj.getDate() + daysToAdd);
      
      // --- 4. Buscar fila destino (Match Fecha + Hora) ---
      let targetRowIndex = -1;
      const SOURCE_TIME_STR_TRIMMED = SOURCE_TIME_STR.toString().trim();

      for (let k = HEADER_ROWS_COUNT; k < ALL_VALUES.length; k++) {
        const CURRENT_DATE = ALL_VALUES[k][COL_INDEX.DATE - 1];
        if (CURRENT_DATE instanceof Date) {
          const isSameDate = (
            CURRENT_DATE.getDate() === NEXT_DATE.getDate() &&
            CURRENT_DATE.getMonth() === NEXT_DATE.getMonth() &&
            CURRENT_DATE.getFullYear() === NEXT_DATE.getFullYear()
          );
          
          if (isSameDate) {
            for (let l = k; l < ALL_VALUES.length; l++) {
              const CURRENT_TIME = ALL_VALUES[l][COL_INDEX.TIME - 1];
              if (CURRENT_TIME && CURRENT_TIME.toString().trim() === SOURCE_TIME_STR_TRIMMED) {
                targetRowIndex = l + 1;
                break; 
              }
              if ((l + 1) < ALL_VALUES.length && ALL_VALUES[l+1][COL_INDEX.DATE - 1] instanceof Date) break;
            }
            break; 
          }
        }
      }
      
      // --- 5. Validar Ocupación y Copiar ---
      if (targetRowIndex !== -1) {
        const TARGET_USER_RANGE = AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.USER);
        const TARGET_USER_VALUE = TARGET_USER_RANGE.getValue();
        const TARGET_DATE_STR = NEXT_DATE.toLocaleDateString('es-ES');
        
        let proceedCopy = true;

        if (TARGET_USER_VALUE && TARGET_USER_VALUE.toString().trim() !== "") {
          const response = UI.alert(
            "¡ATENCIÓN! Cita Ocupada",
            `La cita de **${USER_NAME}** se copiará al **${TARGET_DATE_STR}**.\n\n` +
            `¡Pero la celda ya está ocupada por: **${TARGET_USER_VALUE}**!\n\n` +
            `¿Desea SOBRESCRIBIR la cita existente?`,
            UI.ButtonSet.YES_NO
          );
          if (response === UI.Button.NO) {
            proceedCopy = false;
            errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): Copia cancelada por ocupación.`);
          }
        }

        if (proceedCopy) {
          // Escritura de valores simples
          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.USER).setValue(USER_NAME);
          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.PHONE).setValue(PHONE);
          
          const sessionRange = AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.SESSION);
          sessionRange.setValue(nextSession).setNumberFormat('0'); 
          
          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.NOTES).setValue(NOTES);
          
          /**
           * MEJORA SCRIPTOR MASTER:
           * Aplicamos el RichTextValue capturado. Esto mantiene el enlace intacto
           * ya sea que provenga de una fórmula o de un link manual.
           */
          if (CLINIC_HISTORY_RT) {
            AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.CLINIC_HISTORY).setRichTextValue(CLINIC_HISTORY_RT);
          }
          
          successCount++;
        }
      } else {
        errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): No se encontró destino el ${NEXT_DATE.toLocaleDateString('es-ES')} a las ${SOURCE_TIME_STR}.`);
      }
    } 
  } 

  // --- 6. Mensaje de Finalización ---
  let finalMessage = `✅ Proceso finalizado.\nCitas procesadas con éxito: ${successCount}\n`;
  if (errorMessages.length > 0) {
    finalMessage += `\n⚠️ **Advertencias (${errorMessages.length}):**\n` + errorMessages.join('\n');
  }
  UI.alert(finalMessage);
}