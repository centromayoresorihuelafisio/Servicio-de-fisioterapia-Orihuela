/**
 * LECTURA DE LA AGENDA WEB DESDE LA TABLA PLANA "Citas" (paso 6, FASE 3b de CONTEXTO.md, sección 11)
 *
 * `obtenerAgendaSemanaWeb` (agenda/Web.gs) llama aquí. La hoja `Agenda AAAA-AAAA` quedó congelada como archivo y ya no se lee.
 *
 * Para que el cliente (agenda/Web_Vista.html) no cambie en la lectura, la semana se devuelve con la MISMA forma que daba la hoja vieja:
 * `{ citas, semana, headers, opcionesAsistencia }`, donde cada elemento de `citas` es un objeto con una propiedad por cabecera
 * (Fecha, Día, Hora, Usuario, Teléfono, Sesión, Asistencia, Historia clínica, Notas) más `_fila`, `_fechaISO`,
 * `_horaOrden` y `_hueco`. Diferencias con la hoja vieja:
 *   - `_fila` ya no es un número de fila: es el ID de la cita (o, en un hueco libre, el texto "hueco AAAA-MM-DD HH:mm"). El cliente de
 *     lectura solo lo usa como clave opaca. Se añaden `_id` (ID cita, '' en un hueco) y `_idPaciente` para la fase 3c.
 *   - Los huecos libres se calculan: parrilla del día (`citasHorasDelDia_`) menos las horas con cita y menos las horas cerradas en
 *     Disponibilidad. Una cita nunca se esconde: si está fuera de la parrilla o en una hora cerrada, se devuelve igual.
 *   - Usuario, Teléfono e Historia clínica salen de la Maestra por ID paciente (nombre, "Teléfono 1" y enlace de la ficha). Si la cita no
 *     tiene ID paciente o el usuario ya no existe, se usa el nombre guardado en la cita y teléfono y enlace quedan vacíos.
 *   - Asistencia: "Pendiente" se devuelve como celda vacía (como hoy: sin chip); los otros tres, con su texto limpio. Las opciones del
 *     desplegable son `citasOpcionesAsistencia_()`, no las de la hoja vieja. EN 3c: quitar la asistencia = Pendiente.
 *   - Sin caché del resultado: nombre, teléfono y enlace vienen de la Maestra, cuyos cambios no suben `citasVersion_()`. Si la carga se
 *     notara lenta, la solución es llamar a `citasInvalidarCache_()` en las funciones que editan la Maestra y cachear aquí.
 *
 * Reutiliza SIN modificar: formatearRangoSemanaEs_ (agenda/Web.gs), citasLeer_, citasHorasDelDia_, citasOpcionesAsistencia_
 * (agenda/Citas_Datos.gs), leerDisponibilidad_, disponibilidadCerrada_ (agenda/Disponibilidad.gs), extraerUrlHistoriaClinica_,
 * obtenerIndiceColumnaPorNombre_, resolverColumnaTelefono_ (core/Utils.gs). Prefijo agendaSemana para no chocar en el ámbito global.
 */

const AGENDA_SEMANA_DIAS_ = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Cabeceras de la semana, con el orden que espera el cliente de la Agenda. */
function agendaSemanaCabeceras_() {
  const a = COLUMNAS.SEMANA_WEB;
  return [a.FECHA, a.DIA, a.HORA, a.USUARIO, a.TELEFONO, a.SESION, a.ASISTENCIA, a.HISTORIA_CLINICA, a.NOTAS];
}

/** Lunes y viernes (y las 5 fechas) de la semana que contiene `fechaISO` (sin fecha, la actual). Mismo cálculo que obtenerAgendaSemanaWeb. */
function agendaSemanaDe_(fechaISO, tz) {
  let base;
  if (fechaISO) { const p = String(fechaISO).split('-').map(Number); base = new Date(p[0], p[1] - 1, p[2]); } else { base = new Date(); }
  const dow = base.getDay();
  const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dow + (dow === 0 ? -6 : 1));
  lunes.setHours(0, 0, 0, 0);
  const viernes = new Date(lunes); viernes.setDate(lunes.getDate() + 4);
  const fechas = [];
  for (let i = 0; i < 5; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); fechas.push(Utilities.formatDate(d, tz, 'yyyy-MM-dd')); }
  return {
    fechas: fechas,
    semana: { lunes: fechas[0], viernes: fechas[4], etiqueta: formatearRangoSemanaEs_(lunes, viernes) }
  };
}

function agendaSemanaFechaCorta_(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4); }

/**
 * Nombre, teléfono y enlace de la ficha de los usuarios con esos ID paciente (Maestra). Lee solo las columnas necesarias, una vez.
 * @return {Object<string,{nombre:string, telefono:string, hc:string}>}
 */
function agendaSemanaUsuariosPorId_(ids) {
  const res = {};
  if (!ids || !ids.length) return res;
  const hoja = getSS_().getSheetByName(SHEETS.MAESTRA);
  if (!hoja || hoja.getLastRow() < 2) return res;
  const n = hoja.getLastRow() - 1;
  const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  const col = function (nombre) { return obtenerIndiceColumnaPorNombre_(hoja, nombre); };
  const cId = col(COLUMNAS.MAESTRA.ID_PACIENTE), cNom = col(COLUMNAS.MAESTRA.NOMBRE), cHC = col(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  const cTel = resolverColumnaTelefono_(hoja, cab);
  if (cId === -1) return res;
  const leer = function (c) { return c === -1 ? null : hoja.getRange(2, c + 1, n, 1); };
  const vId = leer(cId).getValues(), rNom = leer(cNom), rTel = leer(cTel), rHC = leer(cHC);
  const vNom = rNom ? rNom.getValues() : null, vTel = rTel ? rTel.getValues() : null;
  const vHC = rHC ? rHC.getValues() : null, ricos = rHC ? rHC.getRichTextValues() : null, formulas = rHC ? rHC.getFormulas() : null;
  const pedidos = {};
  ids.forEach(function (id) { if (id) pedidos[id] = true; });
  for (let i = 0; i < n; i++) {
    const id = String(vId[i][0] || '').trim();
    if (!id || !pedidos[id] || res[id]) continue;
    res[id] = {
      nombre: vNom ? String(vNom[i][0] || '').trim() : '',
      telefono: vTel ? String(vTel[i][0] || '').trim() : '',
      hc: vHC ? extraerUrlHistoriaClinica_(vHC[i][0], ricos[i][0], formulas[i][0]) : ''
    };
  }
  return res;
}

/**
 * Parte PURA (no toca hojas): construye la lista de filas de la semana. Los parámetros permiten probarla sin Sheets.
 * @param {Array} citas Citas de la semana (forma de citasLeer_).
 * @param {Object} usuarios Resultado de agendaSemanaUsuariosPorId_.
 * @param {string[]} fechas Las 5 fechas 'yyyy-MM-dd' (lunes a viernes).
 * @param {function(string):string[]} horasDelDia Parrilla de una fecha (citasHorasDelDia_).
 * @param {function(string,string):boolean} cerrada ¿Hora cerrada en Disponibilidad? (fechaISO, 'HH:mm')
 */
function agendaSemanaConstruir_(citas, usuarios, fechas, horasDelDia, cerrada) {
  const a = COLUMNAS.SEMANA_WEB, filas = [];
  const base = function (iso, hora, hueco) {
    const f = { _fila: '', _id: '', _idPaciente: '', _fechaISO: iso, _horaOrden: hora, _hueco: hueco };
    f[a.FECHA] = agendaSemanaFechaCorta_(iso);
    f[a.DIA] = AGENDA_SEMANA_DIAS_[new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)).getDay()];
    f[a.HORA] = hora;
    f[a.USUARIO] = ''; f[a.TELEFONO] = ''; f[a.SESION] = ''; f[a.ASISTENCIA] = ''; f[a.HISTORIA_CLINICA] = ''; f[a.NOTAS] = '';
    return f;
  };
  fechas.forEach(function (iso) {
    const porHora = {};
    citas.forEach(function (c) { if (c.fecha === iso) (porHora[c.hora] = porHora[c.hora] || []).push(c); });
    const horas = horasDelDia(iso).slice();
    Object.keys(porHora).forEach(function (h) { if (horas.indexOf(h) === -1) horas.push(h); });   // una cita fuera de la parrilla se muestra igual
    horas.sort();
    horas.forEach(function (h) {
      const delHueco = porHora[h];
      if (!delHueco) {
        if (!cerrada(iso, h)) { const f = base(iso, h, true); f._fila = 'hueco ' + iso + ' ' + h; filas.push(f); }
        return;
      }
      delHueco.forEach(function (c) {
        const u = c.idPaciente ? usuarios[c.idPaciente] : null;
        const f = base(iso, h, false);
        f._fila = c.id; f._id = c.id; f._idPaciente = c.idPaciente;
        f[a.USUARIO] = (u && u.nombre) || c.nombre;
        f[a.TELEFONO] = u ? u.telefono : '';
        f[a.SESION] = c.sesion === null || c.sesion === undefined ? '' : c.sesion;
        f[a.ASISTENCIA] = c.asistencia === ASISTENCIA_CITA.PENDIENTE ? '' : c.asistencia;
        f[a.HISTORIA_CLINICA] = u ? u.hc : '';
        f[a.NOTAS] = c.notas;
        filas.push(f);
      });
    });
  });
  return filas;
}

/** Equivalente de obtenerAgendaSemanaWeb leyendo de "Citas" (se llama desde allí con el interruptor activo). */
function obtenerAgendaSemanaDesdeCitasWeb_(fechaISO) {
  try {
    const tz = Session.getScriptTimeZone();
    const s = agendaSemanaDe_(fechaISO, tz);
    const citas = citasDeSemana_(s.semana.lunes, s.semana.viernes);
    const ids = [];
    citas.forEach(function (c) { if (c.idPaciente && ids.indexOf(c.idPaciente) === -1) ids.push(c.idPaciente); });
    const cerradas = leerDisponibilidad_();
    const filas = agendaSemanaConstruir_(citas, agendaSemanaUsuariosPorId_(ids), s.fechas, citasHorasDelDia_,
      function (iso, hora) { return disponibilidadCerrada_(cerradas, iso, hora); });
    return { citas: filas, semana: s.semana, headers: agendaSemanaCabeceras_(), opcionesAsistencia: citasOpcionesAsistencia_() };
  } catch (e) {
    Logger.log('Error en obtenerAgendaSemanaDesdeCitasWeb_: ' + e.message);
    return { citas: [], semana: null, headers: [], error: e.message };
  }
}
