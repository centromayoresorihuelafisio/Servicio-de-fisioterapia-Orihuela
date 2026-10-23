// ================================================================================
// dashboard/Dashboard_Datos.gs — LECTURA de datos, filtros y endpoint del dashboard (CONTEXTO.md, sección 11,
// «Plan del dashboard»). El cálculo vive en dashboard/Dashboard_Metricas.gs (funciones puras).
//
// Fase D1 (citas): obtenerDashboardCitasWeb(filtros) → ocupación, faltas y reincidentes ya agregados (nunca filas).
// Fase D2 (pacientes y episodios): obtenerDashboardPacientesWeb(filtros) → lista y tiempo de espera, altas e inscripciones por
// mes, duración del tratamiento y sesiones asistidas, ya agregados (nunca filas).
// Fase D4 (evolución clínica): obtenerDashboardEvolucionWeb(filtros) → primera frente a última valoración (dolor, función, analgésicos).
// Fase D3 (página): obtenerDashboardWeb(filtros, forzar) → D1 + D2 + D4 en una sola respuesta, con caché de 10 minutos por filtros.
// Cada hoja se lee UNA vez por llamada: "Citas" (citasLeer_), Maestra, "Historias Clínicas" (solo 2 columnas), "Episodios HC",
// Disponibilidad y Recordatorios.
// ================================================================================

// Los cursos anteriores no se tienen en cuenta (decisión 11 del dueño, 21-oct-2026).
const DASH_CURSO_INICIO_ = '2026-09-01';
const DASH_COL_PATOLOGIA_1_ = 'Patología 1';
const DASH_COL_PATOLOGIA_2_ = 'Patología 2';
// Mismo separador de varias patologías en una celda que usa la Base de Datos web (usuarios/BaseDatos_Vista).
const DASH_SEP_PATOLOGIA_ = /\s*(?:[,;\/|·+]|\r?\n)\s*/;

function dashHoy_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function dashFechaValida_(t) { return dashFechaUTC_(t) ? String(t) : ''; }
function dashNorm_(t) { return dashSinTildes_(t).replace(/\s+/g, ' '); }
/** Celda de fecha (Date o texto dd/MM/yyyy o yyyy-MM-dd) → 'yyyy-MM-dd'; '' si no es una fecha válida. */
function dashFechaISO_(v) { return dashFechaValida_(hcAISO_(v, Session.getScriptTimeZone())); }

/** Gravedad escrita en la hoja → 'leve' | 'moderado' | 'urgente' | '' (misma regla que la Base de Datos web). */
function dashClaseGravedad_(v) {
  const n = dashNorm_(v);
  return n.indexOf('leve') !== -1 ? 'leve' : n.indexOf('moderad') !== -1 ? 'moderado' : n.indexOf('urgent') !== -1 ? 'urgente' : '';
}

/** Patologías de un usuario (de "Patología 1" y "Patología 2"), sin repetir (sin tildes ni mayúsculas) ni puntos finales. */
function dashPatologias_(p1, p2) {
  const out = [], vistos = {};
  [p1, p2].forEach(celda => {
    String(celda == null ? '' : celda).split(DASH_SEP_PATOLOGIA_).forEach(s => {
      s = s.replace(/[.\s]+$/, '').trim();
      const k = dashNorm_(s);
      if (!k || vistos[k]) return;
      vistos[k] = true; out.push(s);
    });
  });
  return out;
}

// La Maestra se lee una sola vez por llamada de obtenerDashboardWeb: este valor solo vive durante esa llamada
// (las llamadas sueltas a D1 o D2 la leen cada una, sin memoria).
let DASH_MEMO_MAESTRA_ = null;
function dashLeerMaestra_() { return DASH_MEMO_MAESTRA_ || dashLeerMaestraHoja_(); }

/**
 * Lee la Maestra de la hoja: [{ id, nombre, tipo, gravedad, patologias, estado, enEspera, inscripcion }] (solo filas con nombre e ID paciente;
 * `enEspera` = Estado «En espera», clasificado por palabra clave; `inscripcion` = 'yyyy-MM-dd' o '') y las opciones de
 * los filtros (para los menús de la web).
 */
function dashLeerMaestraHoja_() {
  const hoja = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!hoja || hoja.getLastRow() < 2) return { pacientes: [], opciones: { gravedades: [], tipos: [], patologias: [] } };
  const col = n => obtenerIndiceColumnaPorNombre_(hoja, n);
  const c = { id: col(COLUMNAS.MAESTRA.ID_PACIENTE), nombre: col(COLUMNAS.MAESTRA.NOMBRE), tipo: col(COLUMNAS.MAESTRA.TIPO_INGRESO),
              grav: col(COLUMNAS.MAESTRA.GRAVEDAD), p1: col(DASH_COL_PATOLOGIA_1_), p2: col(DASH_COL_PATOLOGIA_2_),
              estado: col(COLUMNAS.MAESTRA.ESTADO), insc: col(COLUMNAS.MAESTRA.FECHA_INSCRIPCION) };
  if (c.id === -1 || c.nombre === -1) throw new Error('La Maestra no tiene las columnas "' + COLUMNAS.MAESTRA.ID_PACIENTE + '" y "' + COLUMNAS.MAESTRA.NOMBRE + '".');
  const ancho = Math.max.apply(null, Object.keys(c).map(k => c[k])) + 1;
  const dato = (f, i) => i === -1 || f[i] == null ? '' : String(f[i]).trim();
  const tipos = {}, pats = {}, pacientes = [];
  hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).getValues().forEach(f => {
    const id = dato(f, c.id), nombre = dato(f, c.nombre);
    if (!id || !nombre) return;
    const tipo = dato(f, c.tipo), pat = dashPatologias_(dato(f, c.p1), dato(f, c.p2));
    if (tipo && !(dashNorm_(tipo) in tipos)) tipos[dashNorm_(tipo)] = tipo;   // si hay variantes de escritura, se queda la primera
    pat.forEach(p => { if (!(dashNorm_(p) in pats)) pats[dashNorm_(p)] = p; });
    pacientes.push({
      id: id, nombre: nombre, tipo: tipo, gravedad: dashClaseGravedad_(dato(f, c.grav)), patologias: pat,
      estado: dato(f, c.estado), enEspera: dashNorm_(dato(f, c.estado)).indexOf('espera') !== -1,
      inscripcion: c.insc === -1 ? '' : dashFechaISO_(f[c.insc])
    });
  });
  const ordenar = m => Object.keys(m).sort().map(k => m[k]);
  return { pacientes: pacientes, opciones: { gravedades: ['leve', 'moderado', 'urgente'], tipos: ordenar(tipos), patologias: ordenar(pats) } };
}

/**
 * IDs de los usuarios que cumplen los filtros { gravedad, tipo, patologia } (vacío = sin filtrar): { id: true }.
 * Devuelve null si no hay ningún filtro (todas las citas con ID entran, incluso las de usuarios ya borrados).
 */
function dashIdsFiltrados_(pacientes, filtros) {
  const g = dashNorm_(filtros.gravedad), t = dashNorm_(filtros.tipo), p = dashNorm_(filtros.patologia);
  if (!g && !t && !p) return null;
  const ids = {};
  pacientes.forEach(u => {
    if (g && u.gravedad !== g) return;
    if (t && dashNorm_(u.tipo) !== t) return;
    if (p && u.patologias.map(dashNorm_).indexOf(p) === -1) return;
    ids[u.id] = true;
  });
  return ids;
}

/** Días marcados como «Festivo» en Recordatorios: { 'yyyy-MM-dd': true }. */
function dashFestivos_() {
  const mapa = {};
  leerRecordatorios_(obtenerHojaRecordatorios_(false)).forEach(r => { if (r.tipo === 'Festivo' && r.fecha) mapa[r.fecha] = true; });
  return mapa;
}

/**
 * Fase D1: ocupación, faltas y reincidentes.
 * @param {{desdeISO?:string, hastaISO?:string, gravedad?:string, tipo?:string, patologia?:string, umbral?:number}=} filtros
 *   Por defecto: desde el inicio del curso (DASH_CURSO_INICIO_) hasta hoy, sin filtros.
 * @return {{success:boolean, message?:string, hoy?:string, periodo?:Object, filtros?:Object, opciones?:Object,
 *   ocupacion?:Object, faltas?:Object, reincidentes?:Object, diagnostico?:Object}}
 */
function obtenerDashboardCitasWeb(filtros) {
  try {
    filtros = filtros || {};
    const hoy = dashHoy_();
    const desde = dashFechaValida_(filtros.desdeISO) || DASH_CURSO_INICIO_;
    const hasta = dashFechaValida_(filtros.hastaISO) || hoy;
    if (hasta < desde) return { success: false, message: 'La fecha final es anterior a la inicial.' };
    if ((dashFechaUTC_(hasta) - dashFechaUTC_(desde)) / 86400000 > DASH_MAX_DIAS_) return { success: false, message: 'El periodo es demasiado largo.' };

    const maestra = dashLeerMaestra_();
    const ids = dashIdsFiltrados_(maestra.pacientes, filtros);
    let sinId = 0;
    const citas = citasLeer_({ desdeISO: desde, hastaISO: hasta }).filter(c => {
      if (!c.idPaciente) { sinId++; return false; }
      return !ids || ids[c.idPaciente] === true;
    });
    const cerradas = leerDisponibilidad_(), festivos = dashFestivos_();

    const r = dashCalcularCitas_({
      citas: citas, desde: desde, hasta: hasta, hoy: hoy, umbral: Number(filtros.umbral) || 0, festivos: festivos,
      horasDelDia: citasHorasDelDia_, esCerrada: (f, h) => disponibilidadCerrada_(cerradas, f, h)
    });
    const nombres = {};
    maestra.pacientes.forEach(u => { nombres[u.id] = u.nombre; });
    r.reincidentes.lista.forEach(u => { u.nombre = nombres[u.idPaciente] || ''; });

    return {
      success: true, hoy: hoy, periodo: { desde: desde, hasta: hasta },
      filtros: { gravedad: dashNorm_(filtros.gravedad), tipo: String(filtros.tipo || '').trim(), patologia: String(filtros.patologia || '').trim(), umbral: r.reincidentes.umbral },
      opciones: maestra.opciones, ocupacion: r.ocupacion, faltas: r.faltas, reincidentes: r.reincidentes,
      diagnostico: { citasEnPeriodo: citas.length, citasSinId: sinId, fueraDeParrilla: r.ocupacion.fueraDeParrilla, festivos: Object.keys(festivos).length }
    };
  } catch (e) {
    Logger.log('Error en obtenerDashboardCitasWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Episodios de las HC: [{ idPaciente, ingreso, alta }] ('yyyy-MM-dd' o ''). De "Episodios HC" (ID HC | Ingreso | Alta | Nota) y de la
 * columna ID paciente de "Historias Clínicas" (ID HC → ID paciente). De "Historias Clínicas" se leen SOLO esas dos columnas (las de
 * texto de la historia son enormes). `sinPaciente` = episodios cuya HC no tiene ID paciente (no entran).
 */
function dashLeerEpisodios_() {
  const salida = { episodios: [], sinPaciente: 0 };
  const ss = getSS();
  const hojaHC = ss.getSheetByName(HC_WEB_.HOJA_HC), hojaEpi = ss.getSheetByName(HC_WEB_.HOJA_EPI);
  if (!hojaHC || !hojaEpi || hojaHC.getLastRow() < 2 || hojaEpi.getLastRow() < 2) return salida;
  const n = hojaHC.getLastRow() - 1;
  const idsHC = hojaHC.getRange(2, HC_WEB_.COL.ID, n, 1).getValues();
  const idsPac = hojaHC.getRange(2, HC_WEB_.COL.ID_PACIENTE, n, 1).getValues();
  const idHCaPaciente = Object.create(null);
  idsHC.forEach((r, i) => {
    const idHC = String(r[0] == null ? '' : r[0]).trim();
    if (idHC) idHCaPaciente[idHC] = String(idsPac[i][0] == null ? '' : idsPac[i][0]).trim();
  });
  hojaEpi.getRange(2, 1, hojaEpi.getLastRow() - 1, 3).getValues().forEach(r => {
    const ingreso = dashFechaISO_(r[1]), alta = dashFechaISO_(r[2]);
    if (!ingreso && !alta) return;
    const id = idHCaPaciente[String(r[0] == null ? '' : r[0]).trim()];
    if (!id) { salida.sinPaciente++; return; }
    salida.episodios.push({ idPaciente: id, ingreso: ingreso, alta: alta });
  });
  return salida;
}

/**
 * Fase D2: lista y tiempo de espera, altas e inscripciones por mes, duración del tratamiento y sesiones asistidas.
 * @param {{desdeISO?:string, hastaISO?:string, gravedad?:string, tipo?:string, patologia?:string}=} filtros
 *   Por defecto: el curso completo (septiembre a julio) al que pertenece hoy, sin filtros de usuario. La lista de espera es la de
 *   HOY y no depende del periodo.
 * @return {{success:boolean, message?:string, hoy?:string, periodo?:Object, curso?:string, filtros?:Object, opciones?:Object,
 *   listaEspera?:Object, tiempoEspera?:Object, porMes?:Object, duracion?:Object, sesiones?:Object, diagnostico?:Object}}
 */
function obtenerDashboardPacientesWeb(filtros) {
  try {
    filtros = filtros || {};
    const hoy = dashHoy_();
    const curso = dashCursoDe_(hoy, DASH_CURSO_INICIO_);
    const desde = dashFechaValida_(filtros.desdeISO) || curso.desde;
    const hasta = dashFechaValida_(filtros.hastaISO) || curso.hasta;
    if (hasta < desde) return { success: false, message: 'La fecha final es anterior a la inicial.' };
    if ((dashFechaUTC_(hasta) - dashFechaUTC_(desde)) / 86400000 > DASH_MAX_DIAS_) return { success: false, message: 'El periodo es demasiado largo.' };

    const maestra = dashLeerMaestra_();
    const ids = dashIdsFiltrados_(maestra.pacientes, filtros);
    const pacientes = ids ? maestra.pacientes.filter(u => ids[u.id] === true) : maestra.pacientes;
    const lectura = dashLeerEpisodios_();
    const episodios = lectura.episodios.filter(ep => !ids || ids[ep.idPaciente] === true);
    const citas = citasLeer_({ desdeISO: DASH_CURSO_INICIO_ }).filter(c => c.idPaciente && (!ids || ids[c.idPaciente] === true));

    const r = dashCalcularPacientes_({
      pacientes: pacientes, episodios: episodios, citas: citas, desde: desde, hasta: hasta, hoy: hoy, cursoInicio: DASH_CURSO_INICIO_
    });

    return {
      success: true, hoy: hoy, periodo: { desde: desde, hasta: hasta }, curso: curso.etiqueta,
      filtros: { gravedad: dashNorm_(filtros.gravedad), tipo: String(filtros.tipo || '').trim(), patologia: String(filtros.patologia || '').trim() },
      opciones: maestra.opciones, listaEspera: r.listaEspera, tiempoEspera: r.tiempoEspera, porMes: r.porMes, duracion: r.duracion, sesiones: r.sesiones,
      diagnostico: { pacientes: pacientes.length, episodios: episodios.length, episodiosSinPaciente: lectura.sinPaciente, citasLeidas: citas.length }
    };
  } catch (e) {
    Logger.log('Error en obtenerDashboardPacientesWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Herramienta de EDITOR (no llamable desde la web): ejecuta D1 con los valores por defecto y escribe un resumen en el registro. */
function dashboardProbarCitas() {
  const r = obtenerDashboardCitasWeb({});
  if (!r.success) { Logger.log('Error: ' + r.message); return; }
  const t = r.ocupacion.total, f = r.faltas;
  Logger.log('Periodo ' + r.periodo.desde + ' a ' + r.periodo.hasta + ' (hoy ' + r.hoy + ')');
  Logger.log('Ocupación: ' + t.reservadas + ' citas / ' + t.huecos + ' huecos abiertos = ' + t.pctReservada + ' % reservada, ' + t.pctEfectiva + ' % efectiva');
  Logger.log('Por día: ' + r.ocupacion.porDiaSemana.map(x => x.etiqueta + ' ' + x.pctReservada + ' %').join(' · '));
  Logger.log('Faltas: ' + f.noAsistido + ' de ' + f.n + ' citas registradas = ' + f.porcentaje + ' % (sin registrar: ' + f.sinRegistrar + ', pendientes: ' + f.pendiente + ')');
  Logger.log('Reincidentes (' + r.reincidentes.umbral + '+ faltas): ' + r.reincidentes.total + ' de ' + r.reincidentes.usuariosConRegistro + ' usuarios');
  Logger.log('Diagnóstico: ' + JSON.stringify(r.diagnostico));
}

/** Herramienta de EDITOR (no llamable desde la web): ejecuta D2 con los valores por defecto y escribe un resumen en el registro. */
function dashboardProbarPacientes() {
  const r = obtenerDashboardPacientesWeb({});
  if (!r.success) { Logger.log('Error: ' + r.message); return; }
  const le = r.listaEspera, te = r.tiempoEspera, d = r.duracion, s = r.sesiones;
  Logger.log('Curso ' + r.curso + ': ' + r.periodo.desde + ' a ' + r.periodo.hasta + ' (hoy ' + r.hoy + ')');
  Logger.log('Lista de espera hoy: ' + le.total + ' usuarios; espera media ' + le.dias.media + ' días, mediana ' + le.dias.mediana + ' (n=' + le.n + ', sin fecha de inscripción: ' + le.sinFecha + ')');
  Logger.log('Tiempo de espera del primer episodio: media ' + te.dias.media + ' días, mediana ' + te.dias.mediana + ' (n=' + te.n + ' de ' + te.ingresosEnPeriodo + ' ingresos; sin inscripción: ' + te.sinInscripcion + ', incoherentes: ' + te.incoherentes + ')');
  Logger.log('Por mes (inscripciones/altas): ' + r.porMes.meses.map(m => m.mes + ' ' + m.inscripciones + '/' + m.altas).join(' · '));
  Logger.log('Duración: media ' + d.dias.media + ' días, mediana ' + d.dias.mediana + ' (n=' + d.n + ' de ' + d.altasEnPeriodo + ' altas; sin ingreso: ' + d.sinIngreso + ', incoherentes: ' + d.incoherentes + '; episodios abiertos hoy: ' + d.abiertos + ')');
  Logger.log('Sesiones asistidas por episodio: media ' + s.porEpisodio.media + ', mediana ' + s.porEpisodio.mediana + ' (n=' + s.n + '; episodios anteriores a ' + s.desde + ' no medidos: ' + s.excluidosAntiguos + ')');
  Logger.log('Diagnóstico: ' + JSON.stringify(r.diagnostico));
}

// ================================================================================
// D4 — evolución clínica
// ================================================================================

/**
 * Lee la hoja Valoraciones UNA vez: [{ idPaciente, fecha, dolor, funcion, analg }] en el orden de la hoja. Dolor = solo el ítem de
 * dolor del PEG. `sinId` = filas con usuario pero sin ID paciente (no entran: faltan por asignar con `asignarIdPacienteEnValoraciones`);
 * `sinFecha` = filas con ID pero sin una fecha válida.
 */
function dashLeerValoraciones_() {
  const salida = { filas: [], sinId: 0, sinFecha: 0 };
  const hoja = getSS().getSheetByName(SHEETS.VALORACIONES);
  if (!hoja || hoja.getLastRow() < 2) return salida;
  const C = COLUMNAS_NUM.VALORACIONES;
  const ncol = Math.min(hoja.getLastColumn(), C.ID_PACIENTE);
  const num = v => { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  hoja.getRange(2, 1, hoja.getLastRow() - 1, ncol).getValues().forEach(r => {
    if (!String(r[C.NOMBRE - 1] == null ? '' : r[C.NOMBRE - 1]).trim()) return;     // fila vacía o incompleta
    const id = String(r[C.ID_PACIENTE - 1] == null ? '' : r[C.ID_PACIENTE - 1]).trim();
    if (!id) { salida.sinId++; return; }
    const fecha = dashFechaISO_(r[C.FECHA - 1]);
    if (!fecha) { salida.sinFecha++; return; }
    salida.filas.push({ idPaciente: id, fecha: fecha, dolor: num(r[C.PEG_DOLOR - 1]), funcion: num(r[C.FUNCION_GLOBAL - 1]), analg: num(r[C.ANALGESICOS - 1]) });
  });
  return salida;
}

/**
 * Fase D4: evolución clínica (primera frente a última valoración de cada usuario).
 * @param {{desdeISO?:string, hastaISO?:string, gravedad?:string, tipo?:string, patologia?:string}=} filtros
 *   Periodo por defecto: el curso completo de hoy. Entran los usuarios cuya ÚLTIMA valoración cae en el periodo.
 * @return {{success:boolean, message?:string, periodo?:Object, evolucion?:Object, diagnostico?:Object}}
 */
function obtenerDashboardEvolucionWeb(filtros) {
  try {
    filtros = filtros || {};
    const hoy = dashHoy_();
    const curso = dashCursoDe_(hoy, DASH_CURSO_INICIO_);
    const desde = dashFechaValida_(filtros.desdeISO) || curso.desde;
    const hasta = dashFechaValida_(filtros.hastaISO) || curso.hasta;
    if (hasta < desde) return { success: false, message: 'La fecha final es anterior a la inicial.' };
    if ((dashFechaUTC_(hasta) - dashFechaUTC_(desde)) / 86400000 > DASH_MAX_DIAS_) return { success: false, message: 'El periodo es demasiado largo.' };

    const maestra = dashLeerMaestra_();
    const ids = dashIdsFiltrados_(maestra.pacientes, filtros);
    const lectura = dashLeerValoraciones_();
    const valoraciones = lectura.filas.filter(v => !ids || ids[v.idPaciente] === true);
    const evolucion = dashCalcularEvolucion_({ valoraciones: valoraciones, desde: desde, hasta: hasta });
    return {
      success: true, periodo: { desde: desde, hasta: hasta }, evolucion: evolucion,
      diagnostico: { valoraciones: valoraciones.length, filasSinId: lectura.sinId, filasSinFecha: lectura.sinFecha }
    };
  } catch (e) {
    Logger.log('Error en obtenerDashboardEvolucionWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

// ================================================================================
// D4b — flujo de estados
// ================================================================================

/**
 * Lee la hoja «Historial Estado» UNA vez y devuelve solo los cambios del campo Estado:
 * [{ idPaciente, ts, fecha, antes, despues, siembra }] (`siembra` = el Origen empieza por «Siembra»). Las filas sin ID o sin fecha
 * válida no entran y se cuentan en `sinId` / `sinFecha`.
 */
function dashLeerHistorialEstado_() {
  const salida = { filas: [], sinId: 0, sinFecha: 0 };
  const hoja = getSS().getSheetByName(SHEETS.HISTORIAL);
  if (!hoja || hoja.getLastRow() < 2) return salida;
  const tz = Session.getScriptTimeZone(), texto = v => String(v === null || v === undefined ? '' : v).trim();
  hoja.getRange(2, 1, hoja.getLastRow() - 1, 6).getValues().forEach(r => {
    if (dashNorm_(r[2]) !== dashNorm_(COLUMNAS.MAESTRA.ESTADO)) return;     // Tipo de Ingreso y Gravedad no son flujo
    const id = texto(r[0]);
    if (!id) { salida.sinId++; return; }
    const fecha = dashFechaISO_(r[1]);
    const ts = r[1] instanceof Date ? r[1].getTime() : NaN;
    if (!fecha || isNaN(ts)) { salida.sinFecha++; return; }
    salida.filas.push({ idPaciente: id, ts: ts, fecha: fecha, antes: texto(r[3]), despues: texto(r[4]), siembra: texto(r[5]).indexOf('Siembra') === 0 });
  });
  return salida;
}

/**
 * Fase D4b: flujo de estados (entradas por mes, transiciones, tiempo en cada estado y reparto actual).
 * @param {{desdeISO?:string, hastaISO?:string, gravedad?:string, tipo?:string, patologia?:string}=} filtros
 *   Periodo por defecto: el curso completo de hoy. Solo hay datos reales desde que se empezó a registrar el historial (`flujo.datos.desde`).
 * @return {{success:boolean, message?:string, periodo?:Object, flujo?:Object, diagnostico?:Object}}
 */
function obtenerDashboardFlujoWeb(filtros) {
  try {
    filtros = filtros || {};
    const hoy = dashHoy_();
    const curso = dashCursoDe_(hoy, DASH_CURSO_INICIO_);
    const desde = dashFechaValida_(filtros.desdeISO) || curso.desde;
    const hasta = dashFechaValida_(filtros.hastaISO) || curso.hasta;
    if (hasta < desde) return { success: false, message: 'La fecha final es anterior a la inicial.' };
    if ((dashFechaUTC_(hasta) - dashFechaUTC_(desde)) / 86400000 > DASH_MAX_DIAS_) return { success: false, message: 'El periodo es demasiado largo.' };

    const maestra = dashLeerMaestra_();
    const ids = dashIdsFiltrados_(maestra.pacientes, filtros);
    const lectura = dashLeerHistorialEstado_();
    const cambios = lectura.filas.filter(c => !ids || ids[c.idPaciente] === true);
    const estadosActuales = maestra.pacientes.filter(u => !ids || ids[u.id] === true).map(u => ({ id: u.id, estado: u.estado }));
    const flujo = dashCalcularFlujo_({ cambios: cambios, estadosActuales: estadosActuales, desde: desde, hasta: hasta, hoy: hoy });
    return {
      success: true, periodo: { desde: desde, hasta: hasta }, flujo: flujo,
      diagnostico: { filasEstado: cambios.length, filasSinId: lectura.sinId, filasSinFecha: lectura.sinFecha }
    };
  } catch (e) {
    Logger.log('Error en obtenerDashboardFlujoWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/** Herramienta de EDITOR (no llamable desde la web): ejecuta D4b con los valores por defecto y escribe un resumen en el registro. */
function dashboardProbarFlujo() {
  const r = obtenerDashboardFlujoWeb({});
  if (!r.success) { Logger.log('Error: ' + r.message); return; }
  const f = r.flujo, d = f.datos;
  Logger.log('Periodo ' + r.periodo.desde + ' a ' + r.periodo.hasta);
  Logger.log('Estado hoy: ' + f.estadoActual.items.map(x => x.etiqueta + ' ' + x.n).join(' · ') + ' (sin estado: ' + f.estadoActual.sinEstado + ', otros: ' + f.estadoActual.otros + ')');
  Logger.log('Cambios reales desde ' + (d.desde || '—') + ': ' + d.cambiosReales + ' (en el periodo: ' + d.cambiosEnPeriodo + '; filas de siembra: ' + d.filasSiembra + ')');
  Logger.log('Transiciones (' + f.transiciones.total + '): ' + f.transiciones.lista.map(t => t.deEtiqueta + '→' + t.aEtiqueta + ' ' + t.n).join(' · '));
  Logger.log('Tiempo en estado: ' + f.tiempoEnEstado.map(t => t.etiqueta + ' ' + (t.dias.media === null ? '—' : t.dias.media + ' d') + ' (n=' + t.n + ')').join(' · ') + ' · abiertas ' + d.estanciasAbiertas + ', incoherentes ' + d.estanciasIncoherentes);
  Logger.log('Diagnóstico: ' + JSON.stringify(r.diagnostico));
}

// ================================================================================
// D3 — endpoint de la página: D1 + D2 con caché
// ================================================================================

const DASH_CACHE_SEGUNDOS_ = 600;      // decisión del dueño (23-oct-2026): 10 minutos + botón «Actualizar»
const DASH_CACHE_PREFIJO_ = 'dash5:';   // súbelo cuando cambie la forma de la respuesta, para no servir cachés con la forma vieja
const DASH_CACHE_MAX_CARACTERES_ = 90000;   // CacheService admite 100 KB por valor

/** Clave de caché de unos filtros ya normalizados (el periodo siempre va resuelto, así que el valor por defecto comparte clave). */
function dashClaveCache_(f) {
  const texto = JSON.stringify([f.desdeISO, f.hastaISO, dashNorm_(f.gravedad), dashNorm_(f.tipo), dashNorm_(f.patologia), Number(f.umbral) || 0]);
  const dig = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8);
  return DASH_CACHE_PREFIJO_ + dig.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/**
 * Todo lo que pinta la página del dashboard, en una sola llamada (D1 + D2 + D4a + D4b), ya agregado (nunca filas).
 * Guarda el resultado en CacheService 10 minutos por filtros; `forzar` (botón «Actualizar») se salta la caché y la renueva.
 * @param {{desdeISO?:string, hastaISO?:string, gravedad?:string, tipo?:string, patologia?:string, umbral?:number}=} filtros
 *   Periodo por defecto: el curso completo de hoy (septiembre a julio).
 * @param {boolean=} forzar
 * @return {{success:boolean, message?:string, hoy?:string, curso?:{desde:string,hasta:string,etiqueta:string}, periodo?:Object,
 *   filtros?:Object, opciones?:Object, citas?:{ocupacion,faltas,reincidentes,diagnostico}, pacientes?:Object, clinica?:{evolucion,diagnostico}, estados?:{flujo,diagnostico},
 *   generadoEn?:string, desdeCache?:boolean}}
 */
function obtenerDashboardWeb(filtros, forzar) {
  try {
    filtros = filtros || {};
    const hoy = dashHoy_();
    const curso = dashCursoDe_(hoy, DASH_CURSO_INICIO_);
    const f = {
      desdeISO: dashFechaValida_(filtros.desdeISO) || curso.desde,
      hastaISO: dashFechaValida_(filtros.hastaISO) || curso.hasta,
      gravedad: filtros.gravedad, tipo: filtros.tipo, patologia: filtros.patologia, umbral: Number(filtros.umbral) || 0
    };
    const cache = CacheService.getScriptCache(), clave = dashClaveCache_(f);
    if (!forzar) {
      try {
        const guardado = cache.get(clave);
        if (guardado) { const r = JSON.parse(guardado); r.desdeCache = true; return r; }
      } catch (e) { Logger.log('Caché del dashboard ilegible: ' + e.message); }
    }

    DASH_MEMO_MAESTRA_ = null;
    DASH_MEMO_MAESTRA_ = dashLeerMaestraHoja_();
    let citas, pac, cli, flu;
    try {
      citas = obtenerDashboardCitasWeb(f);
      if (!citas.success) return citas;
      pac = obtenerDashboardPacientesWeb(f);
      if (!pac.success) return pac;
      cli = obtenerDashboardEvolucionWeb(f);
      if (!cli.success) return cli;
      flu = obtenerDashboardFlujoWeb(f);
      if (!flu.success) return flu;
    } finally {
      DASH_MEMO_MAESTRA_ = null;
    }

    const r = {
      success: true, hoy: hoy, curso: curso, periodo: pac.periodo, filtros: citas.filtros, opciones: pac.opciones,
      citas: { ocupacion: citas.ocupacion, faltas: citas.faltas, reincidentes: citas.reincidentes, diagnostico: citas.diagnostico },
      pacientes: { listaEspera: pac.listaEspera, tiempoEspera: pac.tiempoEspera, porMes: pac.porMes, duracion: pac.duracion, sesiones: pac.sesiones, diagnostico: pac.diagnostico },
      clinica: { evolucion: cli.evolucion, diagnostico: cli.diagnostico },
      estados: { flujo: flu.flujo, diagnostico: flu.diagnostico },
      generadoEn: new Date().toISOString(), desdeCache: false
    };
    try {
      const texto = JSON.stringify(r);
      if (texto.length < DASH_CACHE_MAX_CARACTERES_) cache.put(clave, texto, DASH_CACHE_SEGUNDOS_);
    } catch (e) { Logger.log('No se pudo guardar la caché del dashboard: ' + e.message); }
    return r;
  } catch (e) {
    Logger.log('Error en obtenerDashboardWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}
