// ARCHIVO: Agenda Web.gs
// Alimenta la vista semanal de la Agenda en la Web App (?page=agenda): una
// tabla de solo lectura de lunes a viernes, con las mismas columnas que la
// hoja plana que genera "Extraer datos Agenda.gs". Reutiliza obtenerHojaAgenda()
// (Utils.gs) para no duplicar la lógica de encontrar la hoja del curso activo,
// y extraerUrlHistoriaClinica() para leer el enlace igual que en la Base de
// Datos Web.
// ================================================================================

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

    // Mismo cálculo de "lunes de esa semana" que ya usa Agenda Semanal.gs.
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
      etiqueta: Utilities.formatDate(lunes, tz, "d 'de' MMMM") + ' – ' + Utilities.formatDate(viernes, tz, "d 'de' MMMM yyyy")
    };

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) {
      return { citas: [], semana: semana, headers: [] };
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim());
    const colFecha = headers.indexOf(COLUMNAS.AGENDA.FECHA);
    const colHora = headers.indexOf(COLUMNAS.AGENDA.HORA);
    const colUsuario = headers.indexOf(COLUMNAS.AGENDA.USUARIO);
    const colHC = headers.indexOf(COLUMNAS.AGENDA.HISTORIA_CLINICA);

    if (colFecha === -1) {
      return { citas: [], semana: semana, headers: headers, error: `No se encontró la columna "${COLUMNAS.AGENDA.FECHA}" en la Agenda.` };
    }

    const rango = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const data = rango.getValues();
    const richTextData = rango.getRichTextValues();
    const formulas = rango.getFormulas();

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

      const cita = {
        _fechaISO: Utilities.formatDate(fecha, tz, 'yyyy-MM-dd'),
        _horaOrden: '',
        _hueco: !tieneReserva
      };

      headers.forEach((h, colIdx) => {
        let value = row[colIdx];

        if (colIdx === colHC) {
          // Mismo enlace de Historia Clínica que en la Base de Datos Web:
          // Rich Text (formato actual) con fallback a fórmula/texto plano.
          value = extraerUrlHistoriaClinica(value, richTextData[i][colIdx], formulas[i][colIdx]);
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

    return { citas: citas, semana: semana, headers: headers };
  } catch (e) {
    Logger.log('Error en obtenerAgendaSemanaWeb: ' + e.message);
    return { citas: [], semana: null, headers: [], error: e.message };
  }
}