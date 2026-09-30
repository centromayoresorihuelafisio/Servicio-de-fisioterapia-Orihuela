/**
 * Normaliza un valor de tiempo de Google Sheets a formato "H:mm"
 */
function getCleanTimeKey(timeValue, timeZone) {
  if (timeValue instanceof Date) {
    return Utilities.formatDate(timeValue, timeZone, 'H:mm');
  }
  return timeValue ? timeValue.toString().trim() : '';
}


/**
 * Copia los datos de la cita seleccionada al siguiente día alterno
 */
function copiarSiguienteCita() {

  const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
  const UI = SpreadsheetApp.getUi();
  const TIME_ZONE = SPREADSHEET.getSpreadsheetTimeZone();

  const AGENDA_SHEET = SPREADSHEET.getActiveSheet();
  const SHEET_NAME = AGENDA_SHEET.getName();

  if (SHEET_NAME.toLowerCase().indexOf('agenda') === -1) {
    UI.alert('Error: La hoja activa debe contener la palabra "Agenda".');
    return;
  }

  const SELECTION_OBJECT = SPREADSHEET.getSelection();
  const ACTIVE_RANGE_LIST = SELECTION_OBJECT.getActiveRangeList();

  if (!ACTIVE_RANGE_LIST) {
    UI.alert('❌ Debe seleccionar una o más celdas de usuario.');
    return;
  }

  const SELECTED_RANGES = ACTIVE_RANGE_LIST.getRanges();

  const COL_INDEX = {
    DATE: 1,
    DAY: 2,
    TIME: 3,
    USER: 4,
    PHONE: 5,
    SESSION: 6,
    CLINIC_HISTORY: 9,
    NOTES: 10
  };

  const ALL_VALUES = AGENDA_SHEET.getDataRange().getValues();
  const HEADER_ROWS_COUNT = 3;

  /**
   * ====================================================
   * CREACIÓN DEL ÍNDICE DE HORARIOS (ULTRA RÁPIDO)
   * ====================================================
   */
  const TIME_INDEX = {};
  let currentDateBlock = null;

  for (let i = HEADER_ROWS_COUNT; i < ALL_VALUES.length; i++) {

    const DATE_CELL = ALL_VALUES[i][COL_INDEX.DATE - 1];
    const TIME_CELL = ALL_VALUES[i][COL_INDEX.TIME - 1];

    if (DATE_CELL instanceof Date) {
      currentDateBlock = DATE_CELL;
    }

    if (!currentDateBlock) continue;

    const TIME_KEY = getCleanTimeKey(TIME_CELL, TIME_ZONE);
    if (!TIME_KEY) continue;

    const dateKey = Utilities.formatDate(
      currentDateBlock,
      TIME_ZONE,
      "yyyy-MM-dd"
    );

    TIME_INDEX[dateKey + "|" + TIME_KEY] = i + 1;
  }

  let successCount = 0;
  let errorMessages = [];

  for (const selection of SELECTED_RANGES) {

    if (selection.getColumn() !== COL_INDEX.USER) {
      errorMessages.push(`❌ El rango ${selection.getA1Notation()} no está en columna Usuario.`);
      continue;
    }

    for (let i = 0; i < selection.getNumRows(); i++) {

      const ROW_NUM = selection.getRow() + i;
      const ARRAY_INDEX = ROW_NUM - 1;

      if (ARRAY_INDEX < HEADER_ROWS_COUNT || ARRAY_INDEX >= ALL_VALUES.length) {
        continue;
      }

      const SOURCE_ROW_VALUES = ALL_VALUES[ARRAY_INDEX];
      const USER_NAME = SOURCE_ROW_VALUES[COL_INDEX.USER - 1];

      if (!USER_NAME || typeof USER_NAME !== 'string' ||
          USER_NAME.startsWith('🟡') || USER_NAME.startsWith('🟠')) {
        continue;
      }

      // determinar fecha origen
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

      const SOURCE_TIME_STR = getCleanTimeKey(
        SOURCE_ROW_VALUES[COL_INDEX.TIME - 1],
        TIME_ZONE
      );

      const PHONE = SOURCE_ROW_VALUES[COL_INDEX.PHONE - 1];
      let sessionValue = SOURCE_ROW_VALUES[COL_INDEX.SESSION - 1];
      const NOTES = SOURCE_ROW_VALUES[COL_INDEX.NOTES - 1];

      const SOURCE_CLINIC_HISTORY_RANGE = AGENDA_SHEET.getRange(
        ROW_NUM,
        COL_INDEX.CLINIC_HISTORY
      );

      const CLINIC_HISTORY_RT = SOURCE_CLINIC_HISTORY_RANGE.getRichTextValue();

      let currentSessionNumber = 0;

      if (typeof sessionValue === 'number' && sessionValue >= 1) {
        currentSessionNumber = sessionValue;
      } else if (typeof sessionValue === 'string') {

        const parsed = parseInt(sessionValue, 10);

        if (!isNaN(parsed)) currentSessionNumber = parsed;
      }

      const nextSession = currentSessionNumber + 1;

      // calcular día destino
      let daysToAdd = 0;
      const dayOfWeek = sourceDateObj.getDay();

      if (dayOfWeek === 1 || dayOfWeek === 2) {
        daysToAdd = 2;
      } else if (dayOfWeek === 3 || dayOfWeek === 4) {
        daysToAdd = 5;
      } else if (dayOfWeek === 5) {
        daysToAdd = 7;
      } else {
        errorMessages.push(`Fila ${ROW_NUM} (${USER_NAME}): Día no válido.`);
        continue;
      }

      const NEXT_DATE = new Date(sourceDateObj);
      NEXT_DATE.setDate(sourceDateObj.getDate() + daysToAdd);

      /**
       * =====================================
       * BÚSQUEDA INSTANTÁNEA DE DESTINO
       * =====================================
       */

      const dateKey = Utilities.formatDate(
        NEXT_DATE,
        TIME_ZONE,
        "yyyy-MM-dd"
      );

      const targetRowIndex =
        TIME_INDEX[dateKey + "|" + SOURCE_TIME_STR] || -1;

      if (targetRowIndex !== -1) {

        const TARGET_USER_RANGE =
          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.USER);

        const TARGET_USER_VALUE = TARGET_USER_RANGE.getValue();

        let proceedCopy = true;

        if (TARGET_USER_VALUE && TARGET_USER_VALUE.toString().trim() !== "") {

          const response = UI.alert(
            "¡ATENCIÓN! Cita ocupada",
            `La cita de ${USER_NAME} se copiará pero la celda contiene ${TARGET_USER_VALUE}. ¿Sobrescribir?`,
            UI.ButtonSet.YES_NO
          );

          if (response === UI.Button.NO) {
            proceedCopy = false;
          }
        }

        if (proceedCopy) {

          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.USER)
            .setValue(USER_NAME);

          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.PHONE)
            .setValue(PHONE);

          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.SESSION)
            .setValue(nextSession)
            .setNumberFormat('0');

          AGENDA_SHEET.getRange(targetRowIndex, COL_INDEX.NOTES)
            .setValue(NOTES);

          if (CLINIC_HISTORY_RT) {

            AGENDA_SHEET
              .getRange(targetRowIndex, COL_INDEX.CLINIC_HISTORY)
              .setRichTextValue(CLINIC_HISTORY_RT);
          }

          successCount++;
        }

      } else {

        errorMessages.push(
          `Fila ${ROW_NUM}: No se encontró el horario ${SOURCE_TIME_STR} para el día ${NEXT_DATE.toLocaleDateString('es-ES')}.`
        );
      }
    }
  }

  let finalMessage = `✅ Proceso Finalizado.\nCitas copiadas: ${successCount}`;

  if (errorMessages.length > 0) {
    finalMessage += `\n\n⚠️ Alertas:\n` + errorMessages.join('\n');
  }

  UI.alert(finalMessage);
}