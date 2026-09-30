/**
 * Exporta las citas de la hoja de Agenda activa al Google Calendar.
 * Crea nuevos eventos o actualiza eventos existentes si ya tienen un ID de Calendar.
 * Esta función está diseñada para ejecutarse de una sola vez para un mes específico.
 */
function exportSheetAgendaToCalendar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptTimeZone = ss.getSpreadsheetTimeZone();
  const defaultCalendar = CalendarApp.getDefaultCalendar();

  // --- SOLICITUD DEL USUARIO: Cuadro de diálogo para el mes ---
  const result = ui.prompt(
    'Exportar a Google Calendar',
    'Ingresa el mes y el año de las citas a exportar (ej. 09/2025):',
    ui.ButtonSet.OK_CANCEL);

  // El usuario canceló
  if (result.getSelectedButton() !== ui.Button.OK) {
    ui.alert('Proceso cancelado por el usuario.');
    return;
  }

  const input = result.getResponseText();
  if (!input || !/^\d{2}\/\d{4}$/.test(input.trim())) {
    ui.alert('Error', 'El formato de fecha no es válido. Usa el formato MM/AAAA (ej. 09/2025).', ui.ButtonSet.OK);
    return;
  }
  const [inputMonthStr, inputYearStr] = input.split('/');
  const inputMonth = parseInt(inputMonthStr, 10);
  const inputYear = parseInt(inputYearStr, 10);

  if (inputMonth < 1 || inputMonth > 12) {
      ui.alert('Error', 'El mes ingresado no es válido. Debe ser un número entre 01 y 12.', ui.ButtonSet.OK);
      return;
  }

  // Obtener la hoja activa
  const sheet = ss.getActiveSheet();
  const sheetName = sheet.getName();

  // Verificar si la hoja activa es una hoja de "Agenda"
  if (!sheetName.startsWith('Agenda ')) {
    ui.alert('Error', 'Por favor, activa la hoja de "Agenda" que deseas exportar al calendario (ej. "Agenda 2024-2025").', ui.ButtonSet.OK);
    return;
  }

  const range = sheet.getDataRange();
  const values = range.getValues();
  const totalRowsInSheet = values.length;

  if (totalRowsInSheet < 2) {
    ui.alert('Información', 'La hoja de agenda está vacía o solo contiene encabezados. No hay citas para exportar.', ui.ButtonSet.OK);
    return;
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

  // Verificar que todas las columnas necesarias existen
  for (const key in colIndices) {
    if (colIndices[key] === -1) {
      if (key !== "notas") {
        ui.alert('Error', `Columna "${key}" no encontrada en la hoja activa "${sheetName}". Asegúrate de que todos los encabezados son correctos.`, ui.ButtonSet.OK);
        return;
      }
    }
  }

  let eventsCreated = 0;
  let eventsUpdated = 0;
  let eventsSkipped = 0;
  let eventsFiltered = 0; // Contador para eventos filtrados por mes
  let lastValidDate = null;

  // El script ahora procesa todas las filas de una sola vez
  for (let i = 1; i < totalRowsInSheet; i++) {
    const row = values[i];
    const rowNum = i + 1;

    const rawFecha = row[colIndices.fecha];
    const horaRaw = row[colIndices.hora];
    const usuario = row[colIndices.usuario];
    const telefono = row[colIndices.telefono];
    const sesion = row[colIndices.sesion];
    const asistencia = row[colIndices.asistencia];
    const idEventoCalendar = row[colIndices.idEventoCalendar];
    const notas = colIndices.notas !== -1 ? row[colIndices.notas] : '';

    let fechaParaEvento = null;
    if (rawFecha instanceof Date) {
      fechaParaEvento = rawFecha;
      lastValidDate = rawFecha;
    } else if (typeof rawFecha === 'string' && rawFecha.trim() !== '') {
      const parsedDate = new Date(rawFecha);
      if (!isNaN(parsedDate.getTime())) {
        fechaParaEvento = parsedDate;
        lastValidDate = parsedDate;
      } else {
        if (lastValidDate) {
          fechaParaEvento = lastValidDate;
        } else {
          eventsSkipped++;
          continue;
        }
      }
    } else {
      if (lastValidDate) {
        fechaParaEvento = lastValidDate;
      } else {
        eventsSkipped++;
        continue;
      }
    }

    // --- FILTRAR POR MES ---
    if (fechaParaEvento.getFullYear() !== inputYear || (fechaParaEvento.getMonth() + 1) !== inputMonth) {
      // Si la fecha de la fila actual es posterior al mes solicitado,
      // y la última fecha válida también es posterior, podemos detener el bucle
      if (fechaParaEvento > new Date(inputYear, inputMonth, 1)) {
        Logger.log(`Deteniendo el proceso: Se ha excedido el mes solicitado.`);
        break; 
      }
      eventsFiltered++;
      continue;
    }

    if (!(fechaParaEvento.getDay() >= 1 && fechaParaEvento.getDay() <= 5)) {
      eventsSkipped++;
      continue;
    }

    let horaFormatted;
    if (horaRaw instanceof Date) {
      horaFormatted = Utilities.formatDate(horaRaw, scriptTimeZone, "HH:mm");
    } else if (typeof horaRaw === 'string' && /^\d{1,2}:\d{2}$/.test(horaRaw.trim())) {
      horaFormatted = horaRaw.trim();
    } else {
      eventsSkipped++;
      continue;
    }

    const sanitizedUsuario = String(usuario || '').trim();
    if (!sanitizedUsuario) {
      eventsSkipped++;
      continue;
    }

    if (asistencia && String(asistencia).trim() === '❌ No') {
      eventsSkipped++;
      continue;
    }

    const [hours, minutes] = horaFormatted.split(':').map(Number);
    const startTime = new Date(fechaParaEvento);
    startTime.setHours(hours, minutes, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(startTime.getMinutes() + 30);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      eventsSkipped++;
      continue;
    }

    const eventTitle = sanitizedUsuario;
    const eventDescription = `Teléfono: ${telefono || 'N/A'}\n` +
                             `Sesión: ${sesion || 'N/A'}\n` +
                             `Notas: ${notas || 'N/A'}`;


    try {
      let event;
      if (idEventoCalendar) {
        try {
          event = defaultCalendar.getEventById(idEventoCalendar);
          if (event) {
            event.setTitle(eventTitle)
                 .setDescription(eventDescription)
                 .setTime(startTime, endTime);
            eventsUpdated++;
          } else {
            event = defaultCalendar.createEvent(eventTitle, startTime, endTime, { description: eventDescription });
            eventsCreated++;
          }
        } catch (e) {
          event = defaultCalendar.createEvent(eventTitle, startTime, endTime, { description: eventDescription });
          eventsCreated++;
        }
      } else {
        const existingEvents = defaultCalendar.getEvents(startTime, endTime, { search: eventTitle });
        
        if (existingEvents.length > 0) {
          eventsSkipped++;
          continue;
        }

        event = defaultCalendar.createEvent(eventTitle, startTime, endTime, { description: eventDescription });
        eventsCreated++;
      }

      const newEventId = event.getId();
      sheet.getRange(rowNum, colIndices.idEventoCalendar + 1).setValue(newEventId);

      try {
        event.removeAllReminders();
      } catch (reminderError) {
        Logger.log(`ERROR: Error al establecer recordatorios para evento en fila ${rowNum} (${usuario}): ${reminderError.message}`);
      }

    } catch (e) {
      Logger.log(`ERROR: Error crítico al crear/actualizar evento para fila ${rowNum} (${usuario}): ${e.message}`);
      eventsSkipped++;
    }
  }

  // Ya no se requiere la limpieza de propiedades ni la creación de triggers
  // ya que la ejecución es única y no por lotes.

  ui.alert('Exportación a Google Calendar',
           `Proceso completado para ${inputMonthStr}/${inputYearStr}:\n` +
           `Citas filtradas: ${eventsFiltered}\n` +
           `Citas procesadas: ${eventsCreated + eventsUpdated + eventsSkipped}\n` +
           `Eventos creados: ${eventsCreated}\n` +
           `Eventos actualizados: ${eventsUpdated}\n` +
           `Eventos saltados: ${eventsSkipped}`,
           ui.ButtonSet.OK);
}