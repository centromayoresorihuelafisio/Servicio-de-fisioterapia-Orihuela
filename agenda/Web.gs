
// hoja plana que genera "herramientas/Aplanar_Agenda.gs". Reutiliza obtenerHojaAgenda()
// (core/Utils.gs) para no duplicar la lógica de encontrar la hoja del curso activo,
// y extraerUrlHistoriaClinica() para leer el enlace igual que en la Base de
// Datos Web.
// ================================================================================

// Nombres de mes en español. Utilities.formatDate con el patrón "MMMM" usa
// el locale del propio script (no el de la hoja), y en muchas cuentas ese
// locale resuelve a inglés — de ahí el "13 de July" en vez de "13 de julio".
// Construimos la etiqueta a mano para que siempre salga en español, sin
// depender de esa configuración.
const MESES_ES_ = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Construye la etiqueta "13 de julio – 17 de julio 2026" para el rango de
 * semana lunes-viernes, siempre con los nombres de mes en español. Si ambas
 * fechas caen en el mismo mes no repite el nombre del mes en la primera.
 */
function formatearRangoSemanaEs_(lunes, viernes) {
  const mismoMes = lunes.getMonth() === viernes.getMonth();
  const inicio = mismoMes
    ? `${lunes.getDate()}`
    : `${lunes.getDate()} de ${MESES_ES_[lunes.getMonth()]}`;
  const fin = `${viernes.getDate()} de ${MESES_ES_[viernes.getMonth()]} ${viernes.getFullYear()}`;
  return `${inicio} – ${fin}`;
}

/**
 * Devuelve las citas de la Agenda para la semana de lunes a viernes que
 * contiene `fechaISO` (formato "yyyy-MM-dd", cualquier día dentro de esa
 * semana). Sin fecha, usa la semana actual.
 */
function obtenerAgendaSemanaWeb(fechaISO) {
  try {
    const sheet = obtenerHojaAgenda();
    const tz = Session.getScriptTimeZone();

    // Construcción de la fecha base sin pasar por new Date(string), que
    // depende de la zona horaria del entorno y puede desplazar el día.
    let base;
    if (fechaISO) {
      const partes = fechaISO.split('-').map(Number);
      base = new Date(partes[0], partes[1] - 1, partes[2]);
    } else {
      base = new Date();
    }

    // Mismo cálculo de "lunes de esa semana" que ya usa agenda/Semanal.gs.
    const dayOfWeek = base.getDay(); // 0=Domingo, 1=Lunes...6=Sábado
    const diff = base.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const lunes = new Date(base.getFullYear(), base.getMonth(), diff);
    lunes.setHours(0, 0, 0, 0);

    const viernes = new Date(lunes);
    viernes.setDate(lunes.getDate() + 4);
    viernes.setHours(23, 59, 59, 999);

    const semana = {
      lunes: Utilities.formatDate(lunes, tz, 'yyyy-MM-dd'),
      viernes: Utilities.formatDate(viernes, tz, 'yyyy-MM-dd'),
      etiqueta: formatearRangoSemanaEs_(lunes, viernes)
    };

    // CACHÉ DE CORTA DURACIÓN: si esta misma semana de esta misma hoja ya se
    // calculó hace menos de 90 segundos (recargar la página, ir a la semana
    // siguiente y volver, etc.), la servimos directamente sin tocar Sheets
    // otra vez. Se invalida automáticamente al guardar cualquier cambio en
    // la Agenda (ver invalidarCacheAgenda_ más abajo), así que nunca muestra
    // datos obsoletos tras una edición.
    const cache = CacheService.getScriptCache();
    const claveCache = 'agendaSemana_' + sheet.getSheetId() + '_' + semana.lunes + '_v' + obtenerVersionCacheAgenda_(sheet);
    const cacheado = cache.get(claveCache);
    if (cacheado) {
      return JSON.parse(cacheado);
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) {
      return { citas: [], semana: semana, headers: [] };
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
    const colHora = headers.indexOf(COLUMNAS.AGENDA.HORA);
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colAsistencia = headers.indexOf(COLUMNAS.AGENDA.ASISTENCIA);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    if (colFecha === -1) {
      return { citas: [], semana: semana, headers: headers, error: `No se encontró la columna "${COLUMNAS.AGENDA.FECHA}" en la Agenda.` };
    }

    // Opciones reales del desplegable de Asistencia (leídas de la propia
    // validación de datos de la hoja, para no tener que mantenerlas a mano
    // sincronizadas con lo que haya en Sheets).
    const opcionesAsistencia = colAsistencia !== -1 ? obtenerOpcionesListaDesplegable_(sheet, colAsistencia + 1) : [];

    // OPTIMIZACIÓN DE RENDIMIENTO: antes se leía la hoja de Agenda del curso
    // ENTERO (todas las semanas, de septiembre a agosto) con getValues +
    // getRichTextValues + getFormulas sobre TODAS las columnas, solo para
    // quedarnos luego con 5 días. Eso es lo que hacía lenta la carga: en una
    // hoja de curso completo son miles de celdas leídas dos veces (rich text
    // y fórmulas) para descartar el 95% del resultado en cada carga o cambio
    // de semana.
    //
    // Ahora primero leemos SOLO la columna Fecha (una columna, todas las
    // filas: barato) para localizar el tramo de filas de esta semana, y
    // después pedimos rich text/fórmulas SOLO de la columna de Historia
    // Clínica (la única que los necesita) y SOLO de ese tramo de filas.
    const columnaFechas = sheet.getRange(2, colFecha + 1, lastRow - 1, 1).getValues();

    let filaInicioRel = -1;
    let filaFinRel = -1;
    for (let i = 0; i < columnaFechas.length; i++) {
      const f = columnaFechas[i][0];
      if (f instanceof Date && f >= lunes && f <= viernes) {
        if (filaInicioRel === -1) filaInicioRel = i;
        filaFinRel = i;
      }
    }

    if (filaInicioRel === -1) {
      // No hay ninguna fila de esta semana en la hoja (p.ej. semana fuera
      // del curso académico generado): devolvemos vacío sin leer más.
      return { citas: [], semana: semana, headers: headers, opcionesAsistencia: opcionesAsistencia };
    }

    const numFilasSemana = filaFinRel - filaInicioRel + 1;
    // +2 porque la hoja empieza en la fila 1 (cabecera) y columnaFechas es
    // 0-based a partir de la fila 2.
    const filaInicioAbs = 2 + filaInicioRel;

    const rango = sheet.getRange(filaInicioAbs, 1, numFilasSemana, lastCol);
    const data = rango.getValues();

    // Rich text y fórmulas: solo de la columna de Historia Clínica (si
    // existe) y solo de las filas de esta semana, no de toda la hoja ni de
    // todas las columnas.
    let richTextCol = null;
    let formulasCol = null;
    if (colHC !== -1) {
      const rangoHC = sheet.getRange(filaInicioAbs, colHC + 1, numFilasSemana, 1);
      richTextCol = rangoHC.getRichTextValues();
      formulasCol = rangoHC.getFormulas();
    }

    const cerradosDisp = leerDisponibilidad_(); // horas cerradas (agenda/Disponibilidad.gs)
    const citas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const fecha = row[colFecha];
      if (!(fecha instanceof Date)) continue;
      if (fecha < lunes || fecha > viernes) continue;

      // Las etiquetas de sección de la plantilla visual ("SEMANA", "MAÑANA",
      // "TARDE") y los huecos sin ninguna hora asignada nunca son un hueco
      // horario real: se detectan porque su celda de Hora no contiene un
      // valor de hora (Sheets guarda las horas como objetos Date). Esas se
      // descartan siempre. Un hueco horario real pero SIN paciente (p.ej.
      // "08:00" vacío) sí se conserva — se marca con _hueco para que el
      // cliente pueda mostrarlo u ocultarlo con el botón "Mostrar huecos".
      if (colHora !== -1 && !(row[colHora] instanceof Date)) continue;

      const usuarioRaw = colUsuario !== -1 ? row[colUsuario] : null;
      const tieneReserva = !!(usuarioRaw && usuarioRaw.toString().trim() !== '');

      // Hueco LIBRE en una hora cerrada en Disponibilidad: no es un hueco real, no se devuelve (así no se ve, no cuenta como libre y no
      // se puede arrastrar a él). Una cita ya puesta en esa hora sí se devuelve: nunca se esconde una cita.
      if (!tieneReserva && colHora !== -1 && disponibilidadCerrada_(cerradosDisp, Utilities.formatDate(fecha, tz, 'yyyy-MM-dd'), Utilities.formatDate(row[colHora], tz, 'HH:mm'))) continue;

      const cita = {
        _fila: filaInicioAbs + i,
        _fechaISO: Utilities.formatDate(fecha, tz, 'yyyy-MM-dd'),
        _horaOrden: '',
        _hueco: !tieneReserva
      };

      headers.forEach((h, colIdx) => {
        let value = row[colIdx];

        if (colIdx === colHC) {
          // Mismo enlace de Historia Clínica que en la Base de Datos Web:
          // Rich Text (formato actual) con fallback a fórmula/texto plano.
          value = extraerUrlHistoriaClinica(value, richTextCol[i][0], formulasCol[i][0]);
        } else if (colIdx === colFecha && value instanceof Date) {
          value = Utilities.formatDate(value, tz, 'dd/MM/yyyy');
        } else if (colIdx === colHora && value instanceof Date) {
          // Sheets guarda las horas como Date con fecha base 1899-12-30.
          value = Utilities.formatDate(value, tz, 'HH:mm');
          cita._horaOrden = value;
        } else if (Object.prototype.toString.call(value) === '[object Date]') {
          value = Utilities.formatDate(value, tz, 'dd/MM/yyyy HH:mm');
        }

        cita[h] = value;
      });

      citas.push(cita);
    }

    // Orden cronológico: fecha y, dentro del mismo día, hora.
    citas.sort((a, b) => {
      if (a._fechaISO !== b._fechaISO) return a._fechaISO < b._fechaISO ? -1 : 1;
      return (a._horaOrden || '').localeCompare(b._horaOrden || '');
    });

    const resultado = { citas: citas, semana: semana, headers: headers, opcionesAsistencia: opcionesAsistencia };

    try {
      cache.put(claveCache, JSON.stringify(resultado), 90); // 90 segundos
    } catch (e) {
      // Si el resultado superase el límite de tamaño de CacheService (100KB),
      // simplemente no se cachea: no es un error, la próxima carga volverá
      // a calcularlo desde Sheets como hasta ahora.
    }

    return resultado;
  } catch (e) {
    Logger.log('Error en obtenerAgendaSemanaWeb: ' + e.message);
    return { citas: [], semana: null, headers: [], error: e.message };
  }
}

/**
 * Devuelve la versión actual de la caché de la Agenda Web para `sheet`.
 * Empieza en 0 y sube cada vez que se guarda un cambio (ver
 * invalidarCacheAgenda_), de forma que las claves de caché de las semanas ya
 * calculadas con la versión anterior dejan de usarse automáticamente sin
 * tener que borrarlas una a una.
 */
function obtenerVersionCacheAgenda_(sheet) {
  const cache = CacheService.getScriptCache();
  const version = cache.get('agendaVersion_' + sheet.getSheetId());
  return version ? parseInt(version, 10) : 0;
}

/**
 * Invalida la caché de la Agenda Web para `sheet`: se llama tras cualquier
 * escritura (Asistencia/Notas/Sesión, asignar paciente, liberar hueco) para
 * que la próxima carga de esa semana refleje el cambio en vez de servir la
 * versión cacheada.
 */
function invalidarCacheAgenda_(sheet) {
  const cache = CacheService.getScriptCache();
  const version = obtenerVersionCacheAgenda_(sheet);
  cache.put('agendaVersion_' + sheet.getSheetId(), String(version + 1), 21600); // 6h, el máximo de CacheService
}

/**
 * Versión actual de la caché de la Agenda del curso activo. Llamada barata
 * (obtenerHojaAgenda() busca la hoja por nombre exacto, sin leer filas, y
 * obtenerVersionCacheAgenda_ solo consulta CacheService) pensada para sondeo
 * frecuente desde agenda/Web_Vista.html: si el número no cambió desde la última
 * comprobación, el cliente no pide los datos completos de la semana.
 */
function obtenerVersionAgendaWeb() {
  try {
    const sheet = obtenerHojaAgenda();
    return { sheetId: sheet.getSheetId(), version: obtenerVersionCacheAgenda_(sheet) };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * Busca en las primeras filas de datos de `sheet` una celda con validación
 * de tipo lista en la columna `colIdx1based` y devuelve sus opciones. Así el
 * desplegable de Asistencia en la Web App siempre coincide con el que
 * definiste en Sheets, sin tener que mantener una copia de los valores.
 */
function obtenerOpcionesListaDesplegable_(sheet, colIdx1based) {
  const lastRow = sheet.getLastRow();
  const limite = Math.min(lastRow, 25);
  if (limite < 2) return [];

  // OPTIMIZACIÓN DE RENDIMIENTO: antes se pedía la validación fila a fila
  // (hasta 24 llamadas getDataValidation() distintas, cada una un viaje de
  // ida y vuelta a Sheets). getDataValidations() (en plural) trae las
  // validaciones de TODO el rango en una sola llamada.
  const validaciones = sheet.getRange(2, colIdx1based, limite - 1, 1).getDataValidations();

  for (let i = 0; i < validaciones.length; i++) {
    const validation = validaciones[i][0];
    if (validation && validation.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      return validation.getCriteriaValues()[0];
    }
  }
  return [];
}

// Campos que se pueden editar sueltos desde una celda de la Agenda Web.
// Cualquier otro nombre de columna que llegue a actualizarCampoAgendaWeb se
// rechaza — evita que un fallo de cliente escriba donde no debe (p.ej. pisar
// el Rich Text de Historia Clínica con texto plano).
// Función en vez de constante global: así COLUMNAS (core/Config.gs) se lee al USAR la
// lista y no al cargar el archivo, y el orden de los archivos en el proyecto deja
// de importar.
function camposEditablesAgenda_() {
  return [
    COLUMNAS.AGENDA.ASISTENCIA,
    COLUMNAS.AGENDA.NOTAS,
    COLUMNAS.AGENDA.SESION
  ];
}

/**
 * Escribe un valor suelto (Asistencia, Notas o Sesión) en la fila `fila` de
 * la Agenda. Es la función que llama la edición en línea de la Web App.
 */
function actualizarCampoAgendaWeb(fila, campo, valor) {
  try {
    if (camposEditablesAgenda_().indexOf(campo) === -1) {
      return { success: false, message: 'Ese campo no se puede editar desde aquí.' };
    }

    const sheet = obtenerHojaAgenda();
    const rowIdx = parseInt(fila, 10);
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colIdx = headers.indexOf(campo);
    if (colIdx === -1) {
      return { success: false, message: `No se encontró la columna "${campo}" en la Agenda.` };
    }

    sheet.getRange(rowIdx, colIdx + 1).setValue(valor);
    invalidarCacheAgenda_(sheet);
    return { success: true };
  } catch (e) {
    Logger.log('Error en actualizarCampoAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

// Columnas que se vacían al liberar un hueco. Fecha, Día y Hora NO se tocan
// porque son el propio "esqueleto" del hueco horario, no datos de la cita.
// Función en vez de constante global (mismo motivo que camposEditablesAgenda_).
function camposABorrarAgenda_() {
  return [
    COLUMNAS.AGENDA.USUARIO,
    COLUMNAS.AGENDA.TELEFONO,
    COLUMNAS.AGENDA.SESION,
    COLUMNAS.AGENDA.ASISTENCIA,
    COLUMNAS.AGENDA.ID_EVENTO_CALENDAR,
    COLUMNAS.AGENDA.HISTORIA_CLINICA,
    COLUMNAS.AGENDA.NOTAS
  ];
}

/**
 * Vacía todos los datos de la cita en la fila `fila`, dejándola como un
 * hueco libre de nuevo. Nota: si la cita tenía un evento de Google Calendar
 * enlazado (columna "ID Evento Calendar"), este borrado NO elimina ese
 * evento del Calendar — solo limpia la hoja. El evento quedaría huérfano.
 */
function eliminarDatosFilaAgendaWeb(fila) {
  try {
    const sheet = obtenerHojaAgenda();
    const rowIdx = parseInt(fila, 10);
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());

    camposABorrarAgenda_().forEach(nombreCampo => {
      const colIdx = headers.indexOf(nombreCampo);
      if (colIdx !== -1) sheet.getRange(rowIdx, colIdx + 1).clearContent();
    });

    invalidarCacheAgenda_(sheet);
    return { success: true, message: 'Hueco liberado correctamente.' };
  } catch (e) {
    Logger.log('Error en eliminarDatosFilaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Vacía los datos de VARIAS citas a la vez (mismo efecto que
 * eliminarDatosFilaAgendaWeb, pero para toda una selección múltiple). Lee
 * las cabeceras una sola vez para las N filas en vez de una vez por fila.
 */
function eliminarVariasCitasWeb(filas) {
  try {
    if (!filas || filas.length === 0) {
      return { success: false, message: 'No hay ninguna cita que eliminar.' };
    }

    const sheet = obtenerHojaAgenda();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());

    const columnasABorrar = camposABorrarAgenda_()
      .map(nombreCampo => headers.indexOf(nombreCampo))
      .filter(colIdx => colIdx !== -1);

    let borradas = 0;
    const errores = [];

    filas.forEach(fila => {
      const rowIdx = parseInt(fila, 10);
      if (!rowIdx || rowIdx < 2 || rowIdx > lastRow) {
        errores.push(`Fila ${fila}: no válida.`);
        return;
      }
      columnasABorrar.forEach(colIdx => sheet.getRange(rowIdx, colIdx + 1).clearContent());
      borradas++;
    });

    if (borradas > 0) invalidarCacheAgenda_(sheet);

    let mensaje = borradas === 1 ? '✅ Cita eliminada correctamente.' : `✅ ${borradas} citas eliminadas correctamente.`;
    if (errores.length > 0) mensaje += `\n⚠️ ${errores.length} no se pudieron eliminar:\n` + errores.join('\n');

    return { success: true, message: mensaje, eliminadas: borradas };
  } catch (e) {
    Logger.log('Error en eliminarVariasCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Deshace un "Eliminar"/"liberar hueco" reciente: repone los valores que
 * tenían los campos (Usuario, Teléfono, Sesión, Asistencia, Notas, Historia
 * Clínica, ID Evento Calendar) antes de vaciarse. A diferencia de Base de
 * Datos o Valoraciones, en la Agenda nunca se borra una fila entera — son
 * huecos horarios fijos — así que deshacer es solo volver a escribir esos
 * campos, no insertar nada.
 * @param {Array<{fila: number, valores: Object}>} snapshots Capturados en el
 *   cliente ANTES de eliminar (ya los tenía en memoria).
 */
function restaurarCitasWeb(snapshots) {
  try {
    if (!snapshots || snapshots.length === 0) {
      return { success: false, message: 'No hay nada que deshacer.' };
    }

    const sheet = obtenerHojaAgenda();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    snapshots.forEach(snap => {
      const fila = parseInt(snap.fila, 10);
      if (!fila || fila < 2 || fila > lastRow) return;

      camposABorrarAgenda_().forEach(nombreCampo => {
        const colIdx = headers.indexOf(nombreCampo);
        if (colIdx === -1) return;
        const valor = snap.valores ? snap.valores[nombreCampo] : undefined;

        if (colIdx === colHC && valor) {
          // Mismo formato de enlace que usa el resto de la app: Rich Text
          // con el texto "Ver Historia Clínica", no la URL a pelo.
          const richText = SpreadsheetApp.newRichTextValue().setText('Ver Historia Clínica').setLinkUrl(valor).build();
          sheet.getRange(fila, colIdx + 1).setRichTextValue(richText);
        } else {
          sheet.getRange(fila, colIdx + 1).setValue(valor === undefined || valor === null ? '' : valor);
        }
      });
    });

    invalidarCacheAgenda_(sheet);
    return { success: true, message: 'Cita(s) restaurada(s) correctamente.' };
  } catch (e) {
    Logger.log('Error en restaurarCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Asigna un paciente a un hueco libre (fila `fila`). Si el nombre coincide
 * con alguien de la Base de Datos Maestra, autocompleta también su Teléfono
 * y su Historia Clínica (mismo enlace que usa la Base de Datos Web); si es
 * un nombre nuevo que no existe en la Maestra, deja esos dos campos vacíos
 * en vez de fallar.
 */
function asignarPacienteHuecoWeb(fila, nombrePaciente) {
  try {
    const sheet = obtenerHojaAgenda();
    const rowIdx = parseInt(fila, 10);
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    // Regla única de nombres (core/Utils.gs). Si el paciente existe en la Maestra se usa SU grafía
    // guardada (la comparación ignora tildes y mayúsculas), así los nombres antiguos con tildes siguen
    // enlazando aunque se escriban sin ellas.
    let nombre = normalizarNombreUsuario(nombrePaciente);
    if (!nombre) return { success: false, message: 'Escribe el nombre del paciente.' };

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colTelefono = headers.indexOf(COLUMNAS.AGENDA.TELEFONO);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    if (colUsuario === -1) {
      return { success: false, message: 'No se encontró la columna "Usuario" en la Agenda.' };
    }

    // Búsqueda del paciente en la Maestra (mismo criterio de coincidencia que
    // el resto del proyecto: nombre exacto, sin distinguir mayúsculas).
    let telefono = '';
    let historiaClinicaUrl = '';

    const ss = getSS();
    const maestra = ss.getSheetByName(SHEETS.MAESTRA);
    if (maestra && maestra.getLastRow() > 1) {
      const lastColM = maestra.getLastColumn();
      const headersM = maestra.getRange(1, 1, 1, lastColM).getValues()[0].map(h => h.toString().trim());
      const colHcM = headersM.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);

      // OPTIMIZACIÓN DE RENDIMIENTO: antes se leían valores, texto enriquecido
      // y fórmulas de TODA la Maestra (todas las columnas de todos los
      // pacientes) solo para quedarse con una fila. Ahora se lee únicamente la
      // columna Nombre para localizar al paciente, y después solo lo que hace
      // falta de esa fila (su fila para el teléfono y la celda de Historia
      // Clínica para el enlace).
      const nombresM = maestra.getRange(2, COLUMNAS_NUM.MAESTRA.NOMBRE, maestra.getLastRow() - 1, 1).getValues();
      let filaMaestra = -1;
      for (let i = 0; i < nombresM.length; i++) {
        const nombreFila = nombresM[i][0] ? nombresM[i][0].toString().trim() : '';
        if (nombreFila && normalizarTexto(nombreFila) === normalizarTexto(nombre)) {
          filaMaestra = i + 2; // fila real en la hoja
          nombre = nombreFila;
          break;
        }
      }

      if (filaMaestra !== -1) {
        const valoresFila = maestra.getRange(filaMaestra, 1, 1, lastColM).getValues()[0];
        telefono = valoresFila[COLUMNAS_NUM.MAESTRA.TELEFONO - 1] || '';
        if (colHcM !== -1) {
          const celdaHC = maestra.getRange(filaMaestra, colHcM + 1);
          historiaClinicaUrl = extraerUrlHistoriaClinica(valoresFila[colHcM], celdaHC.getRichTextValue(), celdaHC.getFormula());
        }
      }
    }

    sheet.getRange(rowIdx, colUsuario + 1).setValue(nombre);
    if (colTelefono !== -1) sheet.getRange(rowIdx, colTelefono + 1).setValue(telefono);
    if (colHC !== -1 && historiaClinicaUrl) {
      const richText = SpreadsheetApp.newRichTextValue().setText('Ver Historia Clínica').setLinkUrl(historiaClinicaUrl).build();
      sheet.getRange(rowIdx, colHC + 1).setRichTextValue(richText);
    }

    // Primera cita = ingreso del episodio (solo si aún no lo tiene; ver hcRegistrarPrimeraCita_ en historia/HC_Web.gs).
    let ingresoRegistrado = false;
    try {
      const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
      const fechaCita = colFecha === -1 ? null : sheet.getRange(rowIdx, colFecha + 1).getValue();
      if (historiaClinicaUrl && fechaCita instanceof Date) {
        ingresoRegistrado = hcRegistrarPrimeraCita_(historiaClinicaUrl, Utilities.formatDate(fechaCita, getSS().getSpreadsheetTimeZone(), 'yyyy-MM-dd'));
      }
    } catch (eIng) { Logger.log('asignarPacienteHuecoWeb: ingreso automático: ' + eIng.message); }

    invalidarCacheAgenda_(sheet);
    return { success: true, usuario: nombre, telefono: telefono, historiaClinica: historiaClinicaUrl, ingresoRegistrado: ingresoRegistrado };
  } catch (e) {
    Logger.log('Error en asignarPacienteHuecoWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Versión web-safe de abrirChatWhatsapp() para una cita de la Agenda: en vez
 * de leer la celda activa (no existe fuera del editor de Sheets), recibe la
 * fila de la Agenda, saca el nombre del paciente de ahí, y reutiliza
 * _generarUrlWhatsappParaNombre() (usuarios/Whatsapp.gs) buscando el teléfono más
 * reciente en la Maestra — igual que hace el botón de WhatsApp de la Base de
 * Datos Web.
 */
function generarUrlWhatsappParaAgendaWeb(fila) {
  try {
    const sheet = obtenerHojaAgenda();
    const rowIdx = parseInt(fila, 10);
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    if (colUsuario === -1) return { success: false, message: 'No se encontró la columna "Usuario" en la Agenda.' };

    const nombreCompleto = sheet.getRange(rowIdx, colUsuario + 1).getValue();
    if (!nombreCompleto || nombreCompleto.toString().trim() === '') {
      return { success: false, message: 'Esa fila no tiene paciente asignado.' };
    }

    const ss = getSS();
    const maestra = ss.getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };

    return _generarUrlWhatsappParaNombre(maestra, nombreCompleto);
  } catch (e) {
    Logger.log('Error en generarUrlWhatsappParaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Datos para el asistente de WhatsApp por lotes de la Agenda. Recibe las filas
 * de la Agenda seleccionadas, lee la Maestra UNA sola vez y devuelve la
 * plantilla cruda (con {{nombre}}) y, por paciente, nombre, primer nombre y
 * teléfono ya con prefijo (o el error que impide escribirle). Descarta los
 * pacientes repetidos (varias citas del mismo usuario) y cuántos fueron.
 * El cliente monta cada URL con el mensaje que tú revises.
 */
function datosWhatsappLoteAgendaWeb(filas) {
  try {
    const sheet = obtenerHojaAgenda();
    const lastRowAgenda = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    if (colUsuario === -1) return { success: false, message: 'No se encontró la columna "Usuario" en la Agenda.' };

    const maestra = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };

    const usuarios = lastRowAgenda >= 2 ? sheet.getRange(2, colUsuario + 1, lastRowAgenda - 1, 1).getValues() : [];
    const vistos = Object.create(null);
    const entradas = [];
    let duplicados = 0;
    (filas || []).forEach(function(f) {
      const rowIdx = parseInt(f, 10);
      if (!rowIdx || rowIdx < 2 || rowIdx > lastRowAgenda) {
        entradas.push({ fila: f, nombre: '', error: 'Fila no válida.' });
        return;
      }
      const nombre = String(usuarios[rowIdx - 2][0] || '').trim();
      if (!nombre) {
        entradas.push({ fila: rowIdx, nombre: '', error: 'Esa fila no tiene paciente asignado.' });
        return;
      }
      if (vistos[nombre]) { duplicados++; return; }
      vistos[nombre] = true;
      entradas.push({ fila: rowIdx, nombre: nombre });
    });

    const porNombre = Object.create(null);
    const nombres = entradas.filter(e => !e.error).map(e => e.nombre);
    if (nombres.length) {
      const datos = _datosWhatsappParaNombres_(maestra, nombres);
      if (!datos.success) return { success: false, message: datos.message };
      datos.items.forEach(it => { porNombre[it.nombre] = it; });
    }

    const items = entradas.map(function(e) {
      if (e.error) return { fila: e.fila, nombre: e.nombre, primerNombre: '', telefono: '', error: e.error };
      const it = porNombre[e.nombre];
      return { fila: e.fila, nombre: e.nombre, primerNombre: it.primerNombre, telefono: it.telefono, error: it.error };
    });
    return { success: true, plantilla: _plantillaWhatsapp_(), items: items, duplicados: duplicados };
  } catch (e) {
    Logger.log('Error en datosWhatsappLoteAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Da de alta al paciente de una cita de la Agenda: localiza su fila en la
 * Maestra por el nombre (igual que el botón de WhatsApp de la Agenda) y
 * reutiliza darDeAltaPacienteWeb(), el mismo proceso del botón Alta de la
 * Base de Datos Web (Estado, fechas y fecha de alta en la Historia Clínica).
 */
function darDeAltaPacienteParaAgendaWeb(fila) {
  try {
    const sheet = obtenerHojaAgenda();
    const rowIdx = parseInt(fila, 10);
    if (!rowIdx || rowIdx < 2 || rowIdx > sheet.getLastRow()) {
      return { success: false, message: 'Fila no válida.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    if (colUsuario === -1) return { success: false, message: 'No se encontró la columna "Usuario" en la Agenda.' };

    const nombreCompleto = sheet.getRange(rowIdx, colUsuario + 1).getValue();
    if (!nombreCompleto || nombreCompleto.toString().trim() === '') {
      return { success: false, message: 'Esa fila no tiene paciente asignado.' };
    }

    const maestra = getSS().getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: "No se encontró la hoja 'Base de Datos Maestra'." };
    const lastRow = maestra.getLastRow();
    if (lastRow < 2) return { success: false, message: 'No hay pacientes registrados en la Maestra.' };

    const buscado = nombreCompleto.toString().trim();
    const nombres = maestra.getRange(2, indiceColumnaNombreMaestra_(maestra) + 1, lastRow - 1, 1).getValues();
    let filaMaestra = -1;
    for (let i = 0; i < nombres.length; i++) {
      if (String(nombres[i][0]).trim() === buscado) { filaMaestra = i + 2; break; }
    }
    if (filaMaestra === -1) {
      return { success: false, message: 'No se encontró a "' + buscado + '" en la Base de Datos Maestra.' };
    }

    return darDeAltaPacienteWeb(filaMaestra);
  } catch (e) {
    Logger.log('Error en darDeAltaPacienteParaAgendaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Construye, en una sola lectura de toda la Agenda, un índice
 * "yyyy-MM-dd|H:mm" → número de fila. Lo usa _prepararCopiaCita() (llamada
 * desde copiarVariasCitasWeb) para localizar la cita destino sin depender de
 * getSelection() (que no existe en la Web App), igual que hacía el
 * TIME_INDEX de copiarSiguienteCita()/copiarSiguienteCita2() en el menú.
 */
function _construirIndiceHorariosAgenda(sheet, tz) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
  const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
  const colHora = headers.indexOf(COLUMNAS.AGENDA.HORA);

  const indice = {};
  if (colFecha === -1 || colHora === -1 || lastRow < 2) {
    return { indice: indice, headers: headers, colFecha: colFecha, colHora: colHora };
  }

  // OPTIMIZACIÓN DE RENDIMIENTO: antes se leía la hoja entera (todas las
  // columnas) solo para quedarnos con Fecha y Hora. Ahora se piden solo esas
  // dos columnas, no las demás (Usuario, Notas, Historia Clínica...).
  const numFilas = lastRow - 1;
  const fechas = sheet.getRange(2, colFecha + 1, numFilas, 1).getValues();
  const horas = sheet.getRange(2, colHora + 1, numFilas, 1).getValues();
  let bloqueFecha = null;

  for (let i = 0; i < numFilas; i++) {
    const celdaFecha = fechas[i][0];
    if (celdaFecha instanceof Date) bloqueFecha = celdaFecha;
    if (!bloqueFecha) continue;

    const claveHora = getCleanTimeKey(horas[i][0], tz);
    if (!claveHora) continue;

    const claveFecha = Utilities.formatDate(bloqueFecha, tz, 'yyyy-MM-dd');
    indice[claveFecha + '|' + claveHora] = i + 2; // fila real: +2 por la cabecera y por ser 0-based
  }

  return { indice: indice, headers: headers, colFecha: colFecha, colHora: colHora };
}

/**
 * Motor compartido para copiar una cita a su(s) fecha(s) siguiente(s), en
 * modo simple (1 destino, patrón de copiarSiguienteCita) o doble (2
 * destinos, patrón de copiarSiguienteCita2). NO escribe nada en la hoja —
 * solo localiza los destinos y comprueba si ya están ocupados. Se usa desde
 * copiarVariasCitasWeb tanto para una sola cita como para varias a la vez
 * (selección múltiple, o el barrido automático de "Copiar Semana").
 */
function _prepararCopiaCita(sheet, indiceInfo, tz, fila, doble) {
  const indice = indiceInfo.indice, headers = indiceInfo.headers, colFecha = indiceInfo.colFecha, colHora = indiceInfo.colHora;
  const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
  const colTelefono = headers.indexOf(COLUMNAS.AGENDA.TELEFONO);
  const colSesion = headers.indexOf(COLUMNAS.AGENDA.SESION);
  const colNotas = headers.indexOf(COLUMNAS.AGENDA.NOTAS);
  const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

  if (colUsuario === -1) return { error: 'No se encontró la columna "Usuario".' };

  const nombre = sheet.getRange(fila, colUsuario + 1).getValue();
  if (!nombre || nombre.toString().trim() === '') {
    return { error: 'Esa fila no tiene paciente asignado.', omitir: true };
  }

  const fecha = sheet.getRange(fila, colFecha + 1).getValue();
  if (!(fecha instanceof Date)) return { error: 'No se pudo determinar la fecha de esta cita.' };

  const dayOfWeek = fecha.getDay();
  let offsets;
  if (!doble) {
    if (dayOfWeek === 1 || dayOfWeek === 2) offsets = [2];
    else if (dayOfWeek === 3 || dayOfWeek === 4) offsets = [5];
    else if (dayOfWeek === 5) offsets = [7];
    else return { error: 'Esta acción solo funciona con citas de lunes a viernes.' };
  } else {
    if (dayOfWeek === 1 || dayOfWeek === 2) offsets = [2, 5];
    else if (dayOfWeek === 3 || dayOfWeek === 4) offsets = [5, 2];
    else return { error: 'Esta acción solo funciona con citas de lunes a jueves (pacientes de doble sesión semanal).' };
  }

  const horaKey = getCleanTimeKey(sheet.getRange(fila, colHora + 1).getValue(), tz);
  let sesionActual = colSesion !== -1 ? sheet.getRange(fila, colSesion + 1).getValue() : 0;
  sesionActual = (typeof sesionActual === 'number' && sesionActual >= 1) ? sesionActual : (parseInt(sesionActual, 10) || 0);

  const cerradosDisp = leerDisponibilidad_(); // horas cerradas (agenda/Disponibilidad.gs)
  const destinos = [];
  let fechaCursor = fecha;
  for (let i = 0; i < offsets.length; i++) {
    fechaCursor = new Date(fechaCursor);
    fechaCursor.setDate(fechaCursor.getDate() + offsets[i]);

    const clave = Utilities.formatDate(fechaCursor, tz, 'yyyy-MM-dd') + '|' + horaKey;
    const filaDestino = indice[clave];
    const fechaTexto = Utilities.formatDate(fechaCursor, tz, 'dd/MM/yyyy');

    if (!filaDestino) {
      return { error: `No se encontró el horario ${horaKey} para el ${fechaTexto}.` };
    }

    const ocupante = sheet.getRange(filaDestino, colUsuario + 1).getValue();
    if (!(ocupante && ocupante.toString().trim() !== '') && disponibilidadCerrada_(cerradosDisp, Utilities.formatDate(fechaCursor, tz, 'yyyy-MM-dd'), horaKey)) {
      return { error: `El hueco de las ${horaKey} del ${fechaTexto} está cerrado en Disponibilidad.` };
    }
    destinos.push({
      filaDestino: filaDestino,
      fechaTexto: fechaTexto,
      sesion: sesionActual + i + 1,
      ocupante: (ocupante && ocupante.toString().trim() !== '') ? ocupante : null
    });
  }

  return {
    nombre: nombre,
    horaKey: horaKey,
    telefono: colTelefono !== -1 ? sheet.getRange(fila, colTelefono + 1).getValue() : '',
    notas: colNotas !== -1 ? sheet.getRange(fila, colNotas + 1).getValue() : '',
    richTextHC: colHC !== -1 ? sheet.getRange(fila, colHC + 1).getRichTextValue() : null,
    destinos: destinos,
    cols: { colUsuario: colUsuario, colTelefono: colTelefono, colSesion: colSesion, colNotas: colNotas, colHC: colHC }
  };
}

/**
 * Escribe en la hoja una preparación ya confirmada (ver _prepararCopiaCita).
 */
function _escribirCopiaCita(sheet, prep) {
  prep.destinos.forEach(function(d) {
    sheet.getRange(d.filaDestino, prep.cols.colUsuario + 1).setValue(prep.nombre);
    if (prep.cols.colTelefono !== -1) sheet.getRange(d.filaDestino, prep.cols.colTelefono + 1).setValue(prep.telefono);
    if (prep.cols.colSesion !== -1) sheet.getRange(d.filaDestino, prep.cols.colSesion + 1).setValue(d.sesion).setNumberFormat('0');
    if (prep.cols.colNotas !== -1) sheet.getRange(d.filaDestino, prep.cols.colNotas + 1).setValue(prep.notas);
    if (prep.cols.colHC !== -1 && prep.richTextHC) sheet.getRange(d.filaDestino, prep.cols.colHC + 1).setRichTextValue(prep.richTextHC);
  });
}

/**
 * Copia varias citas de una vez, cada una en modo simple o doble según
 * `item.doble`. Sustituye a las antiguas copiarSiguienteCitaWeb(fila) /
 * copiarSiguienteCita2Web(fila) de una sola fila — ahora ambos botones (y el
 * nuevo "Copiar Semana") llaman siempre a esta, con un array de 1 o más
 * elementos.
 *
 * Primero se COMPRUEBAN todos los destinos de TODAS las citas antes de
 * escribir nada: si hay algún conflicto (destino ya ocupado) y `forzar` no
 * es true, se devuelven todos juntos en un único mensaje para pedir una sola
 * confirmación — nunca se deja una copia a medias mientras se pregunta.
 *
 * @param {Array<{fila:number, doble:boolean}>} items
 */
function copiarVariasCitasWeb(items, forzar) {
  try {
    if (!items || items.length === 0) {
      return { success: false, message: 'No hay ninguna cita que copiar.' };
    }

    const sheet = obtenerHojaAgenda();
    const tz = Session.getScriptTimeZone();
    const indiceInfo = _construirIndiceHorariosAgenda(sheet, tz);
    if (indiceInfo.colFecha === -1 || indiceInfo.colHora === -1) {
      return { success: false, message: 'No se encontraron las columnas "Fecha" u "Hora" en la Agenda.' };
    }

    const lastRow = sheet.getLastRow();
    const preparaciones = [];
    const errores = [];

    items.forEach(function(item) {
      const rowIdx = parseInt(item.fila, 10);
      if (!rowIdx || rowIdx < 2 || rowIdx > lastRow) {
        errores.push(`Fila ${item.fila}: no válida.`);
        return;
      }
      const prep = _prepararCopiaCita(sheet, indiceInfo, tz, rowIdx, !!item.doble);
      if (prep.error) {
        if (!prep.omitir) errores.push(`Fila ${rowIdx}: ${prep.error}`);
        return;
      }
      preparaciones.push(prep);
    });

    const conflictos = [];
    preparaciones.forEach(function(prep) {
      prep.destinos.forEach(function(d) {
        if (d.ocupante) conflictos.push(`${prep.nombre} → ${d.fechaTexto} a las ${prep.horaKey} (ocupado por ${d.ocupante})`);
      });
    });

    if (conflictos.length > 0 && !forzar) {
      return {
        success: false,
        ocupado: true,
        message: (conflictos.length === 1 ? 'Ya hay una cita en el destino:\n' : `${conflictos.length} de las citas ya tienen destino ocupado:\n`)
          + conflictos.join('\n') + '\n¿Sobrescribir de todas formas?'
      };
    }

    preparaciones.forEach(function(prep) { _escribirCopiaCita(sheet, prep); });
    if (preparaciones.length > 0) invalidarCacheAgenda_(sheet);

    let mensaje = preparaciones.length === 1
      ? `✅ Cita de ${preparaciones[0].nombre} copiada correctamente.`
      : `✅ ${preparaciones.length} citas copiadas correctamente.`;
    if (errores.length > 0) {
      mensaje += `\n⚠️ ${errores.length} no se pudieron copiar:\n` + errores.join('\n');
    }

    return { success: true, message: mensaje, copiadas: preparaciones.length, errores: errores.length };
  } catch (e) {
    Logger.log('Error en copiarVariasCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}


/**
 * Versión web-safe de prepararJornada(): recopila los enlaces de Historia
 * Clínica de las citas de HOY que caen en el turno actual (mañana si son
 * antes de las 14:00, tarde si no), para poder abrirlas todas de golpe antes
 * de empezar la consulta — igual que el diálogo "Lanzador HCs" del menú.
 */
function obtenerEnlacesJornadaWeb() {
  const turno = new Date().getHours() < 14 ? 'mañana' : 'tarde';
  try {
    const sheet = obtenerHojaAgenda();
    const tz = Session.getScriptTimeZone();
    const now = new Date();
    const isMorningShift = now.getHours() < 14;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { urls: [], turno: turno };

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
    const colHora = headers.indexOf(COLUMNAS.AGENDA.HORA);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    if (colFecha === -1 || colHora === -1 || colHC === -1) {
      return { urls: [], turno: turno, error: 'No se encontraron las columnas necesarias en la Agenda.' };
    }

    const hoyInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hoyFin = new Date(hoyInicio);
    hoyFin.setHours(23, 59, 59, 999);

    // OPTIMIZACIÓN DE RENDIMIENTO: antes se leía la hoja de Agenda ENTERA
    // (todas las semanas del curso, todas las columnas) con getValues +
    // getRichTextValues + getFormulas, para quedarnos luego con las citas de
    // un solo día. Mismo patrón que en obtenerAgendaSemanaWeb: primero
    // localizamos el tramo de filas de hoy leyendo solo la columna Fecha, y
    // luego pedimos rich text/fórmulas solo de la columna de Historia
    // Clínica y solo de ese tramo.
    const columnaFechas = sheet.getRange(2, colFecha + 1, lastRow - 1, 1).getValues();

    let filaInicioRel = -1;
    let filaFinRel = -1;
    for (let i = 0; i < columnaFechas.length; i++) {
      const f = columnaFechas[i][0];
      if (f instanceof Date && f >= hoyInicio && f <= hoyFin) {
        if (filaInicioRel === -1) filaInicioRel = i;
        filaFinRel = i;
      }
    }

    if (filaInicioRel === -1) return { urls: [], turno: turno };

    const numFilasHoy = filaFinRel - filaInicioRel + 1;
    const filaInicioAbs = 2 + filaInicioRel;

    const horas = sheet.getRange(filaInicioAbs, colHora + 1, numFilasHoy, 1).getValues();
    const rangoHC = sheet.getRange(filaInicioAbs, colHC + 1, numFilasHoy, 1);
    const valoresHC = rangoHC.getValues();
    const richTextHC = rangoHC.getRichTextValues();
    const formulasHC = rangoHC.getFormulas();

    const urls = [];
    for (let i = 0; i < numFilasHoy; i++) {
      const hora = horas[i][0];
      if (!(hora instanceof Date)) continue; // descarta filas de plantilla, igual que en obtenerAgendaSemanaWeb

      const esManana = hora.getHours() < 14;
      if (esManana !== isMorningShift) continue;

      const url = extraerUrlHistoriaClinica(valoresHC[i][0], richTextHC[i][0], formulasHC[i][0]);
      if (url) urls.push(url);
    }

    return { urls: urls, turno: turno };
  } catch (e) {
    Logger.log('Error en obtenerEnlacesJornadaWeb: ' + e.message);
    return { urls: [], turno: turno, error: e.message };
  }
}
/**
 * Versión web-safe de insertarEnlaceHistoriaClinica.
 * Recibe un array con los números de fila seleccionados en la Agenda Web,
 * busca a esos usuarios en la Maestra y les enlaza su Historia Clínica.
 */
function insertarEnlaceHistoriaClinicaWeb(filas) {
  try {
    if (!filas || filas.length === 0) {
      return { success: false, message: 'No hay ninguna cita seleccionada.' };
    }

    const ss = getSS();
    const sheetAgenda = obtenerHojaAgenda();
    const lastCol = sheetAgenda.getLastColumn();
    const headers = sheetAgenda.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());

    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    if (colUsuario === -1 || colHC === -1) {
      return { success: false, message: "No se encontraron las columnas 'Usuario' o 'Historia clínica' en la Agenda." };
    }

    const mapaHistorias = cargarMapaHistoriasClinicas(ss);
    if (!mapaHistorias) return { success: false, message: "No se pudo cargar el mapa de Historias Clínicas de la Maestra." };

    let enlacesInsertados = 0;

    filas.forEach(fila => {
      const rowIdx = parseInt(fila, 10);
      if (!rowIdx || rowIdx < 2 || rowIdx > sheetAgenda.getLastRow()) return;

      const nombrePacienteRaw = sheetAgenda.getRange(rowIdx, colUsuario + 1).getValue().toString().trim();
      if (!nombrePacienteRaw) return;

      const enlaceInfo = mapaHistorias[nombrePacienteRaw.toLowerCase()];
      if (enlaceInfo) {
        const richTextValue = SpreadsheetApp.newRichTextValue()
          .setText("Ver Historia Clínica")
          .setLinkUrl(enlaceInfo.url)
          .build();

        sheetAgenda.getRange(rowIdx, colHC + 1).setRichTextValue(richTextValue);
        enlacesInsertados++;
      }
    });

    if (enlacesInsertados > 0) {
      invalidarCacheAgenda_(sheetAgenda); // Invalida la caché para que la web se refresque
      return { success: true, message: `✅ Se han insertado ${enlacesInsertados} enlaces de Historia Clínica.` };
    } else {
      return { success: false, message: "⚠️ No se encontraron las historias clínicas de esos pacientes en la Base de Datos Maestra." };
    }

  } catch (e) {
    Logger.log('Error en insertarEnlaceHistoriaClinicaWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}
/**
 * Mueve una cita de un hueco a otro (Drag & Drop).
 * Copia los datos al destino y los borra del origen. Fecha, Día y Hora no se
 * tocan (son el esqueleto del hueco). El "ID Evento Calendar" viaja con la
 * cita, así que el evento se recoloca en la próxima exportación a Calendar.
 * Protegida con LockService para que dos movimientos simultáneos no se pisen.
 */
function moverCitaWeb(filaOrigen, filaDestino) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = obtenerHojaAgenda();
    const rowOrig = parseInt(filaOrigen, 10);
    const rowDest = parseInt(filaDestino, 10);
    const lastRow = sheet.getLastRow();

    if (!rowOrig || !rowDest || rowOrig < 2 || rowDest < 2 || rowOrig > lastRow || rowDest > lastRow) {
      return { success: false, message: 'Filas no válidas.' };
    }
    if (rowOrig === rowDest) {
      return { success: true, message: 'Misma fila, sin cambios.' };
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
    const colHora = headers.indexOf(COLUMNAS.AGENDA.HORA);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);
    const colSesion = headers.indexOf(COLUMNAS.AGENDA.SESION);
    if (colUsuario === -1) return { success: false, message: 'Falta la columna Usuario.' };

    // Una sola lectura por fila para validar origen y destino
    const filaO = sheet.getRange(rowOrig, 1, 1, lastCol).getValues()[0];
    const filaD = sheet.getRange(rowDest, 1, 1, lastCol).getValues()[0];
    const ocupada = fila => !!(fila[colUsuario] && fila[colUsuario].toString().trim() !== '');

    if (!ocupada(filaO)) {
      return { success: false, message: 'La cita de origen ya no existe (¿la ha cambiado otra persona?).' };
    }
    if (ocupada(filaD)) {
      return { success: false, message: 'El hueco de destino ya está ocupado.' };
    }
    // El destino debe ser un hueco horario real (fecha y hora válidas), no una etiqueta de la plantilla
    const esFecha = v => Object.prototype.toString.call(v) === '[object Date]';
    if ((colFecha !== -1 && !esFecha(filaD[colFecha])) || (colHora !== -1 && !esFecha(filaD[colHora]))) {
      return { success: false, message: 'El destino no es un hueco horario válido.' };
    }

    // Escritura en destino (la Historia Clínica conserva su enlace en RichText)
    const rtvHC = colHC !== -1 ? sheet.getRange(rowOrig, colHC + 1).getRichTextValue() : null;
    const colsMovidas = [];
    camposABorrarAgenda_().forEach(nombreCampo => {
      const c = headers.indexOf(nombreCampo);
      if (c === -1) return;
      colsMovidas.push(c);
      const destino = sheet.getRange(rowDest, c + 1);
      if (c === colHC && rtvHC) {
        destino.setRichTextValue(rtvHC);
      } else {
        destino.setValue(filaO[c]);
        if (c === colSesion && filaO[c] !== '') destino.setNumberFormat('0');
      }
    });

    // Vaciar el origen en una sola llamada
    const a1 = colsMovidas.map(c => sheet.getRange(rowOrig, c + 1).getA1Notation());
    if (a1.length) sheet.getRangeList(a1).clearContent();

    SpreadsheetApp.flush();
    invalidarCacheAgenda_(sheet);
    return { success: true, message: 'Cita reubicada correctamente.' };
  } catch (e) {
    Logger.log('Error en moverCitaWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}

/**
 * Intercambia los datos de dos citas ocupadas (drag & drop de una cita sobre otra).
 * Fecha, Día y Hora no se tocan; el "ID Evento Calendar" viaja con cada cita.
 */
function intercambiarCitasWeb(filaA, filaB) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const sheet = obtenerHojaAgenda();
    const rA = parseInt(filaA, 10), rB = parseInt(filaB, 10);
    const lastRow = sheet.getLastRow();
    if (!rA || !rB || rA < 2 || rB < 2 || rA > lastRow || rB > lastRow) return { success: false, message: 'Filas no válidas.' };
    if (rA === rB) return { success: true, message: 'Misma fila, sin cambios.' };

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);
    const colSesion = headers.indexOf(COLUMNAS.AGENDA.SESION);
    if (colUsuario === -1) return { success: false, message: 'Falta la columna Usuario.' };

    const vA = sheet.getRange(rA, 1, 1, lastCol).getValues()[0];
    const vB = sheet.getRange(rB, 1, 1, lastCol).getValues()[0];
    const ocupada = fila => !!(fila[colUsuario] && fila[colUsuario].toString().trim() !== '');
    if (!ocupada(vA) || !ocupada(vB)) {
      return { success: false, message: 'Alguna de las citas ya no existe (¿la ha cambiado otra persona?).' };
    }

    // Leer todo ANTES de escribir (incluido el enlace de la Historia Clínica)
    const rtA = colHC !== -1 ? sheet.getRange(rA, colHC + 1).getRichTextValue() : null;
    const rtB = colHC !== -1 ? sheet.getRange(rB, colHC + 1).getRichTextValue() : null;

    camposABorrarAgenda_().forEach(nombreCampo => {
      const c = headers.indexOf(nombreCampo);
      if (c === -1) return;
      [[rA, vB, rtB], [rB, vA, rtA]].forEach(par => {
        const rango = sheet.getRange(par[0], c + 1);
        if (c === colHC && par[2]) {
          rango.setRichTextValue(par[2]);
        } else {
          rango.setValue(par[1][c]);
          if (c === colSesion && par[1][c] !== '') rango.setNumberFormat('0');
        }
      });
    });

    SpreadsheetApp.flush();
    invalidarCacheAgenda_(sheet);
    return { success: true, message: 'Citas intercambiadas correctamente.' };
  } catch (e) {
    Logger.log('Error en intercambiarCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* sin bloqueo que liberar */ }
  }
}


