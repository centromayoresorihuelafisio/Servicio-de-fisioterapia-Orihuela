// **********************************************
// 1. GESTIÓN DE CITAS (COPIADO A DOS SEMANAS ALTERNAS)
// **********************************************

/**
 * Copia los datos de la cita seleccionada (en la columna 'Usuario')
 * a las dos siguientes fechas alternas correspondientes (T1 y T2),
 * manteniendo la hora y el patrón L-M / M-J. 
 * * MEJORA SCRIPTOR MASTER: Implementación de getRichTextValue() para 
 * preservar hipervínculos en la columna "Historia clínica" en ambas copias.
 */
function copiarSiguienteCita2() {
  // Configuración de la aplicación
  const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
  const UI = SpreadsheetApp.getUi();
  const TIME_ZONE = SPREADSHEET.getSpreadsheetTimeZone(); 

  // --- Validación de Hoja Activa ---
  const AGENDA_SHEET = SPREADSHEET.getActiveSheet();
  const SHEET_NAME = AGENDA_SHEET.getName();
  
  if (SHEET_NAME.toLowerCase().indexOf('agenda') === -1) {
    UI.alert('Error: La hoja activa ("' + SHEET_NAME + '") debe contener la palabra "Agenda" para ejecutar esta función.');
    return;
  }
  
  // --- Validación de Selección ---
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
  
  // Obtenemos todos los datos (valores)
  const ALL_VALUES = AGENDA_SHEET.getDataRange().getValues();
  const HEADER_ROWS_COUNT = 3; 
  let successCount = 0;
  let errorMessages = [];

  // --- LÓGICA DE ITERACIÓN PARA RANGOS MÚLTIPLES ---
  for (const selection of SELECTED_RANGES) {
    if (selection.getColumn() !== COL_INDEX.USER) { 
        errorMessages.push(`❌ Error: El rango [${selection.getA1Notation()}] no está en la columna "Usuario" (Columna D) y ha sido ignorado.`);
        continue; 
    }
    
    for (let i = 0; i < selection.getNumRows(); i++) {
        
        const ROW_NUM = selection.getRow() + i; 
        const ARRAY_INDEX = ROW_NUM - 1; 
        
        if (ARRAY_INDEX < HEADER_ROWS_COUNT || ARRAY_INDEX >= ALL_VALUES.length) {
            continue;
        }

        const SOURCE_ROW_VALUES = ALL_VALUES[ARRAY_INDEX]; 
        const USER_NAME = SOURCE_ROW_VALUES[COL_INDEX.USER - 1]?.toString().trim(); 
        
        if (!USER_NAME || USER_NAME.startsWith('🟡') || USER_NAME.startsWith('🟠')) {
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
            errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): No se pudo determinar la fecha de la cita origen.`);
            continue;
        }

        // --- 2. Extraer y preparar datos de la cita origen ---
        const SOURCE_TIME_STR = getCleanTimeKey(SOURCE_ROW_VALUES[COL_INDEX.TIME - 1], TIME_ZONE); 
        const PHONE = SOURCE_ROW_VALUES[COL_INDEX.PHONE - 1]; 
        let sessionValue = SOURCE_ROW_VALUES[COL_INDEX.SESSION - 1]; 
        const NOTES = SOURCE_ROW_VALUES[COL_INDEX.NOTES - 1]; 
        
        /**
         * MEJORA MAESTRA:
         * Obtenemos el objeto RichTextValue para preservar el link de Drive.
         */
        const SOURCE_CLINIC_HISTORY_RANGE = AGENDA_SHEET.getRange(ROW_NUM, COL_INDEX.CLINIC_HISTORY);
        const CLINIC_HISTORY_RT = SOURCE_CLINIC_HISTORY_RANGE.getRichTextValue();
        
        let currentSession = (typeof sessionValue === 'number' && sessionValue >= 1) ? sessionValue : 0; 

        // --- 3. Calcular las dos fechas destino (T1 y T2) ---
        let daysToAdd1 = 0; 
        let daysToAdd2 = 0; 
        const dayOfWeek = sourceDateObj.getDay(); 
        
        if (dayOfWeek === 1 || dayOfWeek === 2) { 
          daysToAdd1 = 2; 
          daysToAdd2 = 5; 
        } else if (dayOfWeek === 3 || dayOfWeek === 4) { 
          daysToAdd1 = 5; 
          daysToAdd2 = 2; 
        } else {
          errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): La cita del ${sourceDateObj.toLocaleDateString('es-ES')} no es Lunes a Jueves.`);
          continue;
        }
        
        const TARGET_DATE_1 = new Date(sourceDateObj);
        TARGET_DATE_1.setDate(sourceDateObj.getDate() + daysToAdd1);
        
        const TARGET_DATE_2 = new Date(TARGET_DATE_1); 
        TARGET_DATE_2.setDate(TARGET_DATE_1.getDate() + daysToAdd2);

        // --- 4. Definir objetivos de copia ---
        const copyTargets = [
            { date: TARGET_DATE_1, session: currentSession + 1, index: 1 },
            { date: TARGET_DATE_2, session: currentSession + 2, index: 2 }
        ];

        // --- 5. Búsqueda y Copia para CADA objetivo ---
        const isSameDateOnly = (date1, date2) => {
          return date1.getDate() === date2.getDate() &&
                 date1.getMonth() === date2.getMonth() &&
                 date1.getFullYear() === date2.getFullYear();
        };

        for (const target of copyTargets) {
            const nextDate = target.date;
            const nextSession = target.session;
            
            let targetRowIndex = -1;
            let currentDateBlock = null;

            for (let k = HEADER_ROWS_COUNT; k < ALL_VALUES.length; k++) {
              const CURRENT_DATE_CELL = ALL_VALUES[k][COL_INDEX.DATE - 1];
              const CURRENT_TIME_CELL = ALL_VALUES[k][COL_INDEX.TIME - 1];
              
              if (CURRENT_DATE_CELL instanceof Date) currentDateBlock = CURRENT_DATE_CELL;
              
              if (currentDateBlock && isSameDateOnly(currentDateBlock, nextDate)) {
                const DESTINATION_TIME_STR = getCleanTimeKey(CURRENT_TIME_CELL, TIME_ZONE);
                if (DESTINATION_TIME_STR === SOURCE_TIME_STR) {
                  targetRowIndex = k + 1;
                  break; 
                }
              }
            }
            
            if (targetRowIndex !== -1) {
              // Valores simples
              AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.USER).setValue(USER_NAME);
              AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.PHONE).setValue(PHONE);
              AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.SESSION).setValue(nextSession);
              AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.NOTES).setValue(NOTES);
              
              /**
               * APLICACIÓN DEL VÍNCULO:
               * Se aplica el RichTextValue capturado en el paso 2.
               */
              if (CLINIC_HISTORY_RT) {
                AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.CLINIC_HISTORY).setRichTextValue(CLINIC_HISTORY_RT);
              }
              
              successCount++;
            } else {
              errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): No se encontró destino para cita ${target.index} (${nextDate.toLocaleDateString('es-ES')}).`);
            }
        } 
    } 
  } 

  // --- 6. Mensaje de Finalización ---
  let finalMessage = '✅ Citas añadidas correctamente.\n';
  finalMessage += `Citas copiadas con éxito: ${successCount}\n`;
  
  if (errorMessages.length > 0) {
    finalMessage += '\n⚠️ **Advertencias (' + errorMessages.length + '):**\n' + errorMessages.join('\n');
  }
  UI.alert(finalMessage);
}