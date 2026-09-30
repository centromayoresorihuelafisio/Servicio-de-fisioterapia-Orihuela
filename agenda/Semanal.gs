/**
 * Obtiene los eventos del calendario predeterminado para una semana específica.
 */
function getCalendarEventsForWeek(startDateTimestamp) {
  const scriptTimeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const defaultCalendar = CalendarApp.getDefaultCalendar();

  const startDate = new Date(startDateTimestamp);
  // Asegurarse de que la fecha de inicio sea el lunes de esa semana a las 00:00:00
  const dayOfWeek = startDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Ajustar para que el lunes sea el primer día de la semana
  startDate.setDate(diff);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6); // El final de la semana (Domingo)
  endDate.setHours(23, 59, 59, 999);

  Logger.log(`DEBUG: Buscando eventos en Google Calendar desde ${startDate.toLocaleString()} hasta ${endDate.toLocaleString()}`);

  const events = defaultCalendar.getEvents(startDate, endDate);
  const formattedEvents = [];

  events.forEach(event => {
    const eventStartTime = event.getStartTime();
    const eventEndTime = event.getEndTime();

    // Solo incluir eventos que tengan un título y que no sean eventos de todo el día
    if (event.getTitle() && !event.isAllDayEvent()) {
      formattedEvents.push({
        id: event.getId(),
        title: event.getTitle(),
        start: Utilities.formatDate(eventStartTime, scriptTimeZone, "yyyy-MM-dd'T'HH:mm:ss"),
        end: Utilities.formatDate(eventEndTime, scriptTimeZone, "yyyy-MM-dd'T'HH:mm:ss"),
        dateFormatted: Utilities.formatDate(eventStartTime, scriptTimeZone, "dd/MM/yyyy"),
        dayOfWeek: Utilities.formatDate(eventStartTime, scriptTimeZone, "EEEE"), // Nombre completo del día de la semana
        timeFormatted: Utilities.formatDate(eventStartTime, scriptTimeZone, "HH:mm"),
        description: event.getDescription() || ''
      });
    }
  });

  // Opcional: ordenar los eventos por fecha y hora de inicio
  formattedEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  Logger.log(`DEBUG: Se encontraron ${formattedEvents.length} eventos de calendario.`);
  return formattedEvents;
}

/**
 * Abre el diálogo modal con el visor de agenda semanal.
 */
function showAgendaModal() {
  const html = HtmlService.createHtmlOutputFromFile("agenda/Semanal_Vista")
    .setWidth(1400) // MODIFICACIÓN: Ancho del modal ajustado
    .setHeight(900); // MODIFICACIÓN: Alto del modal ajustado
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

/**
 * Obtiene los datos de la agenda para una semana específica de la hoja correspondiente.
 * @param {number} startDateTimestamp El timestamp de la fecha de inicio de la semana (Lunes).
 * @returns {Array<Object>} Un array de objetos con los datos de las citas de la semana.
 */
function getWeekData(startDateTimestamp) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptTimeZone = ss.getSpreadsheetTimeZone();

  const startDate = new Date(startDateTimestamp);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  let startCourseYear = startDate.getFullYear();
  if (startDate.getMonth() < 8) {
    startCourseYear--;
  }
  const sheetName = `Agenda ${startCourseYear}-${startCourseYear + 1}`;

  Logger.log(`DEBUG: getWeekData llamada para timestamp: ${startDateTimestamp}`);
  Logger.log(`DEBUG: Fecha de inicio de semana (Lunes): ${startDate.toLocaleDateString('es-ES')}`);
  Logger.log(`DEBUG: Fecha de fin de semana (Domingo): ${endDate.toLocaleDateString('es-ES')}`);
  Logger.log(`DEBUG: Buscando hoja con nombre: "${sheetName}"`);

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`ERROR: Hoja "${sheetName}" no encontrada.`);
    return [];
  }

  const range = sheet.getDataRange();
  const values = range.getValues();

  if (values.length < 2) {
    Logger.log('DEBUG: La hoja de agenda está vacía o solo contiene encabezados.');
    return [];
  }

  const headers = values[0];
  const colIndices = {
    fecha: headers.indexOf(COLUMNAS.AGENDA.FECHA),
    dia: headers.indexOf(COLUMNAS.AGENDA.DIA),
    hora: headers.indexOf(COLUMNAS.AGENDA.HORA),
    usuario: headers.indexOf(COLUMNAS.AGENDA.USUARIO),
    telefono: headers.indexOf(COLUMNAS.AGENDA.TELEFONO),
    sesion: headers.indexOf(COLUMNAS.AGENDA.SESION),
    asistencia: headers.indexOf(COLUMNAS.AGENDA.ASISTENCIA),
    idEventoCalendar: headers.indexOf(COLUMNAS.AGENDA.ID_EVENTO_CALENDAR),
    notas: headers.indexOf(COLUMNAS.AGENDA.NOTAS)
  };

  for (const key in colIndices) {
    if (colIndices[key] === -1) {
      if (key !== "notas") {
        Logger.log(`ERROR: Columna "${key}" no encontrada en la hoja "${sheetName}". Encabezados: ${headers.join(', ')}`);
        return [];
      }
    }
  }

  const sanitizeValue = (value) => {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue === '' || trimmedValue.toLowerCase() === 'n/a' || trimmedValue.toLowerCase() === 'null') {
        return '';
      }
    }
    return value;
  };

  const agenda = [];
  let lastValidDateInViewer = null;
  let eventsSkipped = 0;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowDateRaw = row[colIndices.fecha];
    const rowTimeRaw = row[colIndices.hora];
    let currentDateForViewer = null;

    if (rowDateRaw instanceof Date && !isNaN(rowDateRaw.getTime())) {
      currentDateForViewer = rowDateRaw;
      lastValidDateInViewer = rowDateRaw;
    } else if (typeof rowDateRaw === 'string' && rowDateRaw.trim() !== '') {
      const parsedDate = new Date(rowDateRaw);
      if (!isNaN(parsedDate.getTime())) {
        currentDateForViewer = parsedDate;
        lastValidDateInViewer = parsedDate;
      } else {
        if (lastValidDateInViewer) {
          currentDateForViewer = lastValidDateInViewer;
        } else {
          Logger.log(`Saltando fila ${i + 1}: Celda de fecha no válida y sin fecha previa para heredar. RawFecha: '${rowDateRaw}'`);
          eventsSkipped++;
          continue;
        }
      }
    } else {
      if (lastValidDateInViewer) {
        currentDateForViewer = lastValidDateInViewer;
      } else {
        Logger.log(`Saltando fila ${i + 1}: Celda de fecha vacía y sin fecha previa para heredar. RawFecha: '${rowDateRaw}'`);
        eventsSkipped++;
        continue;
      }
    }

    if (!(currentDateForViewer.getTime() >= startDate.getTime() && currentDateForViewer.getTime() <= endDate.getTime()) ||
      !(currentDateForViewer.getDay() >= 1 && currentDateForViewer.getDay() <= 5)) {
      Logger.log(`DEBUG (Visor): Fila ${i + 1} saltada: Fecha (${currentDateForViewer.toLocaleDateString('es-ES')}) fuera de rango semanal o no es día laborable.`);
      continue;
    }

    let formattedTime = '';
    if (rowTimeRaw instanceof Date) {
      formattedTime = Utilities.formatDate(rowTimeRaw, scriptTimeZone, 'HH:mm');
    } else if (typeof rowTimeRaw === 'string' && /^\d{1,2}:\d{2}$/.test(rowTimeRaw.trim())) {
      formattedTime = rowTimeRaw.trim();
    } else {
      Logger.log(`DEBUG (Visor): Fila ${i + 1} saltada: Hora no válida o formato inesperado (${typeof rowTimeRaw}: ${rowTimeRaw}).`);
      continue;
    }

    const user = sanitizeValue(row[colIndices.usuario]);
    if (user !== '' && formattedTime !== '') {
      agenda.push({
        Fecha: Utilities.formatDate(currentDateForViewer, scriptTimeZone, 'dd/MM/yyyy'),
        Dia: sanitizeValue(row[colIndices.dia]),
        Hora: formattedTime,
        Usuario: user,
        Teléfono: sanitizeValue(row[colIndices.telefono]),
        Sesión: sanitizeValue(row[colIndices.sesion]),
        Asistencia: sanitizeValue(row[colIndices.asistencia]),
        Notas: sanitizeValue(row[colIndices.notas])
      });
    } else {
      Logger.log(`DEBUG (Visor): Fila ${i + 1} saltada: Usuario o Hora vacíos.`);
    }
  }

  agenda.sort((a, b) => {
    const dateA = new Date(a.Fecha.split('/').reverse().join('-') + 'T' + a.Hora);
    const dateB = new Date(b.Fecha.split('/').reverse().join('-') + 'T' + b.Hora);
    return dateA - dateB;
  });

  Logger.log(`DEBUG: Se encontraron ${agenda.length} citas para la semana.`);
  return agenda;
}