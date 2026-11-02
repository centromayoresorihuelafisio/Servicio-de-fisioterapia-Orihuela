/**
 * dashboard/Dashboard_Metricas.gs — D1 del Dashboard (CONTEXTO.md, sección 11, «Plan del dashboard»).
 *
 * FUNCIONES PURAS: reciben datos ya leídos (arrays, funciones) y devuelven números. No tocan hojas, ni `Session`, ni `Utilities`,
 * así que se prueban en Node con datos inventados. La lectura de las hojas, los filtros de usuario y la función llamable
 * (`obtenerDashboardCitasWeb_`) están en dashboard/Dashboard_Datos.gs.
 *
 * Definiciones (decisiones del dueño, sección 11):
 *  · Hueco abierto = parrilla del día (lunes-viernes 08:00-14:00 y lunes-jueves 16:00-20:00, cada 30 min) menos las horas
 *    cerradas en Disponibilidad y menos los días con un recordatorio «Festivo».
 *  · Ocupación RESERVADA = citas en huecos abiertos (cualquier asistencia) ÷ huecos abiertos.
 *    Ocupación EFECTIVA = solo citas «Asistido» ÷ huecos abiertos. Solo cuentan los días ya transcurridos (hasta hoy).
 *  · Una cita que cae fuera de un hueco abierto (hora cerrada después, festivo...) NO entra en el cociente (daría más del
 *    100 %): se cuenta aparte en `fueraDeParrilla`.
 *  · % de faltas = No asistido ÷ (Asistido + No asistido + Justificada). «Pendiente» queda fuera; si su fecha ya pasó se
 *    cuenta como «sin registrar».
 *  · Reincidente = usuario con `umbral` (por defecto 2) o más citas «No asistido» en el periodo.
 *  · Con filtros de usuario la ocupación es la parte de la capacidad total que ocupa ese grupo: los huecos no dependen del usuario.
 */

const DASH_MAX_DIAS_ = 400;          // periodo máximo que acepta obtenerDashboardCitasWeb_
const DASH_UMBRAL_REINCIDENTE_ = 2;
const DASH_UMBRAL_ABANDONO_ = 3;    // decisión del dueño (26-oct-2026): «abandono» = más de 2 citas «No asistido» (3 o más) en el periodo
const DASH_DIAS_ = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };

// Categorías de asistencia: la ASISTENCIA_CITA de core/Config.gs. Se resuelve al llamar (no al cargar el archivo, porque el orden de
// carga de los archivos de Apps Script no está garantizado); la copia de respaldo solo sirve para probar este archivo en Node.
function dashAsistencia_() {
  return (typeof ASISTENCIA_CITA !== 'undefined') ? ASISTENCIA_CITA
    : { PENDIENTE: 'Pendiente', ASISTIDO: 'Asistido', NO_ASISTIDO: 'No asistido', JUSTIFICADA: 'Justificada' };
}

/** Minúsculas, sin tildes y sin espacios en los extremos. */
function dashSinTildes_(t) {
  return String(t === null || t === undefined ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** 'yyyy-MM-dd' → milisegundos UTC de ese día; null si no es una fecha válida (también 30 de febrero, etc.). */
function dashFechaUTC_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(ms);
  return (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) ? ms : null;
}
function dashISODeNum_(n) {
  const d = new Date(n * 86400000);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}
/** Día de la semana de un 'yyyy-MM-dd': 0 (domingo) a 6. */
function dashDiaSemana_(iso) { return new Date(dashFechaUTC_(iso)).getUTCDay(); }
/** Lunes ('yyyy-MM-dd') de la semana de una fecha. */
function dashLunesDe_(iso) { return dashISODeNum_(dashFechaUTC_(iso) / 86400000 - ((dashDiaSemana_(iso) + 6) % 7)); }
function dashPct_(a, b) { return b > 0 ? Math.round(a / b * 1000) / 10 : null; }

/**
 * Ocupación entre `desde` y `hasta` (inclusive, recortado a `hoy`).
 * @param {Array<{fecha:string,hora:string,asistencia:string}>} citas
 * @param {{desde:string,hasta:string,hoy:string,horasDelDia:function(string):string[],esCerrada:function(string,string):boolean,festivos:Object}} cfg
 */
function dashOcupacion_(citas, cfg) {
  const A = dashAsistencia_();
  const hasta = cfg.hasta < cfg.hoy ? cfg.hasta : cfg.hoy;
  const abiertos = Object.create(null);              // 'fecha|hora' → true
  const dias = {}, franjas = {}, semanas = {};
  const total = { huecos: 0, reservadas: 0, efectivas: 0 };
  const acum = (obj, k) => obj[k] || (obj[k] = { huecos: 0, reservadas: 0, efectivas: 0 });

  const ini = dashFechaUTC_(cfg.desde) / 86400000, fin = dashFechaUTC_(hasta) / 86400000;
  for (let n = ini; n <= fin; n++) {
    const fecha = dashISODeNum_(n);
    if (cfg.festivos && cfg.festivos[fecha]) continue;
    const dow = dashDiaSemana_(fecha);
    cfg.horasDelDia(fecha).forEach(h => {
      if (cfg.esCerrada(fecha, h)) return;
      abiertos[fecha + '|' + h] = true;
      total.huecos++; acum(dias, dow).huecos++; acum(franjas, h).huecos++; acum(semanas, dashLunesDe_(fecha)).huecos++;
    });
  }

  let fueraDeParrilla = 0;
  citas.forEach(c => {
    if (c.fecha < cfg.desde || c.fecha > hasta) return;
    if (!abiertos[c.fecha + '|' + c.hora]) { fueraDeParrilla++; return; }
    const efectiva = c.asistencia === A.ASISTIDO;
    [total, acum(dias, dashDiaSemana_(c.fecha)), acum(franjas, c.hora), acum(semanas, dashLunesDe_(c.fecha))]
      .forEach(o => { o.reservadas++; if (efectiva) o.efectivas++; });
  });

  const fila = (o, extra) => Object.assign(extra, {
    huecos: o.huecos, reservadas: o.reservadas, efectivas: o.efectivas,
    pctReservada: dashPct_(o.reservadas, o.huecos), pctEfectiva: dashPct_(o.efectivas, o.huecos)
  });
  const vacio = { huecos: 0, reservadas: 0, efectivas: 0 };
  return {
    desde: cfg.desde, hasta: hasta,
    total: fila(total, {}),
    fueraDeParrilla: fueraDeParrilla,
    porDiaSemana: [1, 2, 3, 4, 5].map(d => fila(dias[d] || vacio, { dia: d, etiqueta: DASH_DIAS_[d] })),
    porFranja: Object.keys(franjas).sort().map(h => fila(franjas[h], { hora: h })),
    porSemana: Object.keys(semanas).sort().map(l => fila(semanas[l], { semana: l }))
  };
}

/**
 * Cálculo de D1: ocupación, faltas y reincidentes. Las citas ya vienen filtradas (periodo, usuarios, con ID paciente).
 * @param {{citas:Array<{fecha:string,hora:string,idPaciente:string,asistencia:string}>, desde:string, hasta:string, hoy:string,
 *   umbral?:number, festivos:Object, horasDelDia:function(string):string[], esCerrada:function(string,string):boolean}} e
 * @return {{ocupacion:Object, faltas:Object, atendidos:Object, abandonos:Object, reincidentes:Object}}
 */
function dashCalcularCitas_(e) {
  const A = dashAsistencia_();
  const umbral = e.umbral >= 1 ? Math.floor(e.umbral) : DASH_UMBRAL_REINCIDENTE_;
  const enPeriodo = e.citas.filter(c => c.fecha >= e.desde && c.fecha <= e.hasta);

  const ocupacion = dashOcupacion_(enPeriodo, { desde: e.desde, hasta: e.hasta, hoy: e.hoy, horasDelDia: e.horasDelDia, esCerrada: e.esCerrada, festivos: e.festivos || {} });

  const cont = { asistido: 0, noAsistido: 0, justificada: 0, pendiente: 0, sinRegistrar: 0 };
  const porUsuario = Object.create(null);
  const atendidos = Object.create(null);     // usuarios con al menos una cita «Asistido»
  enPeriodo.forEach(c => {
    if (c.asistencia === A.ASISTIDO) atendidos[c.idPaciente] = true;
    const u = porUsuario[c.idPaciente] || (porUsuario[c.idPaciente] = { registradas: 0, noAsistidas: 0 });
    if (c.asistencia === A.ASISTIDO) { cont.asistido++; u.registradas++; }
    else if (c.asistencia === A.NO_ASISTIDO) { cont.noAsistido++; u.registradas++; u.noAsistidas++; }
    else if (c.asistencia === A.JUSTIFICADA) { cont.justificada++; u.registradas++; }
    else if (c.fecha < e.hoy) cont.sinRegistrar++;
    else cont.pendiente++;
  });
  const registradas = cont.asistido + cont.noAsistido + cont.justificada;

  const lista = Object.keys(porUsuario)
    .filter(id => porUsuario[id].noAsistidas >= umbral)
    .map(id => ({ idPaciente: id, nombre: '', noAsistidas: porUsuario[id].noAsistidas, registradas: porUsuario[id].registradas }))
    .sort((a, b) => b.noAsistidas - a.noAsistidas || b.registradas - a.registradas || (a.idPaciente < b.idPaciente ? -1 : 1));
  const usuariosConRegistro = Object.keys(porUsuario).filter(id => porUsuario[id].registradas > 0).length;
  const nAtendidos = Object.keys(atendidos).length;
  const nAbandonos = Object.keys(porUsuario).filter(id => porUsuario[id].noAsistidas >= DASH_UMBRAL_ABANDONO_).length;

  return {
    ocupacion: ocupacion,
    faltas: Object.assign({ n: registradas, porcentaje: dashPct_(cont.noAsistido, registradas) }, cont),
    atendidos: { usuarios: nAtendidos, sesiones: cont.asistido, media: nAtendidos ? Math.round(cont.asistido / nAtendidos * 10) / 10 : null },
    abandonos: { umbral: DASH_UMBRAL_ABANDONO_, total: nAbandonos, usuariosConRegistro: usuariosConRegistro },
    reincidentes: { umbral: umbral, total: lista.length, usuariosConRegistro: usuariosConRegistro, pct: dashPct_(lista.length, usuariosConRegistro), lista: lista.slice(0, 20) }
  };
}

// ================================================================================
// D2 — PACIENTES Y EPISODIOS (CONTEXTO.md, sección 11, «Plan del dashboard»)
//
// Definiciones (decisiones del dueño, secciones 4 y 11):
//  · Lista de espera hoy = usuarios con Estado «En espera». Días de espera = hoy − Fecha inscripción.
//  · Tiempo de espera = fecha del INGRESO del primer episodio (primera cita) − fecha de inscripción. Cuenta a los usuarios cuyo
//    primer ingreso cae en el periodo. Sin fecha de inscripción (lo antiguo) o con fechas incoherentes no se mide: se cuentan aparte.
//  · Inscripciones por mes = usuarios con Fecha inscripción en ese mes. Altas por mes = episodios con fecha de alta en ese mes.
//  · Duración del tratamiento = alta − ingreso (días) de los episodios CERRADOS cuya alta cae en el periodo.
//  · Sesiones asistidas por episodio = citas «Asistido» del usuario entre ingreso y alta (la tabla de citas solo existe desde
//    `cursoInicio`: los episodios que empezaron antes no se miden, para no falsear la media con sesiones que no están en la tabla).
//  · Cada métrica devuelve `n` = con cuántos casos se calculó, y aparte los que se dejaron fuera y por qué.
// ================================================================================

const DASH_TRAMOS_ESPERA_ = [7, 14, 30, 60];        // días: 0–7, 8–14, 15–30, 31–60, 61+
const DASH_TRAMOS_DURACION_ = [14, 30, 60, 90];     // días: 0–14, 15–30, 31–60, 61–90, 91+
const DASH_TRAMOS_SESIONES_ = [5, 10, 15, 20];      // sesiones: 0–5, 6–10, 11–15, 16–20, 21+

/** Días entre dos 'yyyy-MM-dd' (b − a); null si alguna no es una fecha válida. */
function dashDiasEntre_(a, b) {
  const x = dashFechaUTC_(a), y = dashFechaUTC_(b);
  return (x === null || y === null) ? null : Math.round((y - x) / 86400000);
}

/** Meses ('yyyy-MM') desde el mes de `desde` hasta el mes de `hasta`, ambos incluidos. */
function dashMesesEntre_(desde, hasta) {
  const out = [];
  let a = +desde.slice(0, 4), m = +desde.slice(5, 7);
  const fa = +hasta.slice(0, 4), fm = +hasta.slice(5, 7);
  while (a < fa || (a === fa && m <= fm)) {
    out.push(a + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; a++; }
  }
  return out;
}

/**
 * Curso (septiembre a julio) al que pertenece `hoy` ('yyyy-MM-dd'). Agosto cuenta como el final del curso que acaba de terminar.
 * `inicioMinimo` recorta el comienzo (no se miran cursos anteriores al 2026-2027).
 * @return {{desde:string, hasta:string, etiqueta:string}}  p. ej. 2026-09-01, 2027-07-31, «2026-2027»
 */
function dashCursoDe_(hoy, inicioMinimo) {
  const y = +hoy.slice(0, 4), m = +hoy.slice(5, 7);
  const ini = m >= 9 ? y : y - 1;
  let desde = ini + '-09-01';
  if (inicioMinimo && desde < inicioMinimo) desde = inicioMinimo;
  return { desde: desde, hasta: (ini + 1) + '-07-31', etiqueta: ini + '-' + (ini + 1) };
}

/** Media (1 decimal), mediana, mínimo y máximo de una lista de números; todo null si está vacía. */
function dashResumen_(valores) {
  const v = valores.slice().sort((a, b) => a - b), n = v.length;
  if (!n) return { media: null, mediana: null, min: null, max: null };
  const suma = v.reduce((s, x) => s + x, 0);
  return { media: Math.round(suma / n * 10) / 10, mediana: n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2, min: v[0], max: v[n - 1] };
}

/** Reparte los valores en tramos [0–t1], [t1+1–t2]… y un último abierto («t+»). `topes` = límites superiores, de menor a mayor. */
function dashTramos_(valores, topes) {
  const out = topes.map((t, i) => { const d = i === 0 ? 0 : topes[i - 1] + 1; return { etiqueta: d + '–' + t, desde: d, hasta: t, n: 0 }; });
  const ult = topes[topes.length - 1] + 1;
  out.push({ etiqueta: ult + '+', desde: ult, hasta: null, n: 0 });
  valores.forEach(x => {
    for (let i = 0; i < out.length; i++) { if (out[i].hasta === null || x <= out[i].hasta) { out[i].n++; break; } }
  });
  return out;
}

/**
 * Cálculo de D2. Todo llega ya filtrado por usuario (Gravedad, Tipo de Ingreso, Patología) y las fechas ya normalizadas.
 * @param {{pacientes:Array<{id:string,enEspera:boolean,inscripcion:string}>, episodios:Array<{idPaciente:string,ingreso:string,alta:string}>,
 *   citas:Array<{fecha:string,idPaciente:string,asistencia:string}>, desde:string, hasta:string, hoy:string, cursoInicio:string}} e
 *   `inscripcion`, `ingreso` y `alta` son 'yyyy-MM-dd' o '' si no hay fecha. `citas` = citas desde `cursoInicio` (todas las asistencias).
 */
function dashCalcularPacientes_(e) {
  const A = dashAsistencia_();
  const enPeriodo = f => !!f && f >= e.desde && f <= e.hasta;

  // Lista de espera hoy (no depende del periodo).
  const espera = e.pacientes.filter(p => p.enEspera);
  const diasEspera = [];
  let esperaSinFecha = 0, esperaIncoherentes = 0;
  espera.forEach(p => {
    const d = p.inscripcion ? dashDiasEntre_(p.inscripcion, e.hoy) : null;
    if (d === null) esperaSinFecha++; else if (d < 0) esperaIncoherentes++; else diasEspera.push(d);
  });

  // Inscripciones por mes.
  const serie = Object.create(null);
  dashMesesEntre_(e.desde, e.hasta).forEach(m => { serie[m] = { mes: m, inscripciones: 0, altas: 0, futuro: (m + '-01') > e.hoy }; });
  const inscripcion = Object.create(null);
  let inscripciones = 0, sinFechaInscripcion = 0;
  e.pacientes.forEach(p => {
    if (!p.inscripcion) { sinFechaInscripcion++; return; }
    inscripcion[p.id] = p.inscripcion;
    if (enPeriodo(p.inscripcion)) { serie[p.inscripcion.slice(0, 7)].inscripciones++; inscripciones++; }
  });

  // Episodios: altas por mes, duración, sesiones y primer ingreso de cada usuario.
  const asistidas = Object.create(null);                       // idPaciente → fechas de citas Asistido
  e.citas.forEach(c => { if (c.idPaciente && c.asistencia === A.ASISTIDO) (asistidas[c.idPaciente] = asistidas[c.idPaciente] || []).push(c.fecha); });
  const primerIngreso = Object.create(null);
  const dur = [], ses = [];
  let altas = 0, abiertos = 0, durSinIngreso = 0, durIncoherentes = 0, sesAntiguos = 0, sesTotal = 0;
  e.episodios.forEach(ep => {
    if (ep.ingreso && (!primerIngreso[ep.idPaciente] || ep.ingreso < primerIngreso[ep.idPaciente])) primerIngreso[ep.idPaciente] = ep.ingreso;
    if (ep.ingreso && !ep.alta) abiertos++;
    if (!enPeriodo(ep.alta)) return;
    altas++; serie[ep.alta.slice(0, 7)].altas++;
    if (!ep.ingreso) { durSinIngreso++; return; }
    const d = dashDiasEntre_(ep.ingreso, ep.alta);
    if (d === null || d < 0) { durIncoherentes++; return; }
    dur.push(d);
    if (ep.ingreso < e.cursoInicio) { sesAntiguos++; return; }
    const k = (asistidas[ep.idPaciente] || []).filter(f => f >= ep.ingreso && f <= ep.alta).length;
    ses.push(k); sesTotal += k;
  });

  // Tiempo de espera del primer episodio: primer ingreso (en el periodo) − inscripción.
  const esp = [];
  let ingresosEnPeriodo = 0, espSinInscripcion = 0, espIncoherentes = 0;
  Object.keys(primerIngreso).forEach(id => {
    if (!enPeriodo(primerIngreso[id])) return;
    ingresosEnPeriodo++;
    if (!inscripcion[id]) { espSinInscripcion++; return; }
    const d = dashDiasEntre_(inscripcion[id], primerIngreso[id]);
    if (d === null || d < 0) espIncoherentes++; else esp.push(d);
  });

  return {
    listaEspera: { total: espera.length, n: diasEspera.length, sinFecha: esperaSinFecha, incoherentes: esperaIncoherentes,
                   dias: dashResumen_(diasEspera), tramos: dashTramos_(diasEspera, DASH_TRAMOS_ESPERA_) },
    tiempoEspera: { n: esp.length, ingresosEnPeriodo: ingresosEnPeriodo, sinInscripcion: espSinInscripcion, incoherentes: espIncoherentes,
                    dias: dashResumen_(esp), tramos: dashTramos_(esp, DASH_TRAMOS_ESPERA_) },
    porMes: { meses: Object.keys(serie).sort().map(m => serie[m]), inscripciones: inscripciones, altas: altas, sinFechaInscripcion: sinFechaInscripcion },
    duracion: { n: dur.length, altasEnPeriodo: altas, sinIngreso: durSinIngreso, incoherentes: durIncoherentes, abiertos: abiertos,
                dias: dashResumen_(dur), tramos: dashTramos_(dur, DASH_TRAMOS_DURACION_) },
    sesiones: { n: ses.length, excluidosAntiguos: sesAntiguos, desde: e.cursoInicio, total: sesTotal,
                porEpisodio: dashResumen_(ses), tramos: dashTramos_(ses, DASH_TRAMOS_SESIONES_) }
  };
}

// ================================================================================
// D4 — EVOLUCIÓN CLÍNICA (CONTEXTO.md, sección 11, «Plan del dashboard»)
//
// Reglas decididas por el dueño (23-oct-2026):
//  · Se compara la PRIMERA frente a la ÚLTIMA valoración de cada usuario; hacen falta al menos dos valoraciones de fechas distintas.
//  · Dolor = solo el ítem de dolor del PEG (0-10; menos es mejor). Función global = 0-10 (más es mejor).
//  · Analgésicos = número 0-5 (0 Ninguno, 1 Ocasional, 2 Semanal, 3 Habitual, 4 Diario, 5 Varios al día; vacío = sin registrar).
//    Menos consumo cuenta como mejor, pero NO entra en la regla de mejora.
//  · «Mejora» = el dolor baja O la función sube. «Empeora» = no mejora y el dolor sube o la función baja. El resto, «sin cambio».
// Reglas añadidas al implementarlo (fáciles de cambiar aquí):
//  · Entra en el periodo el usuario cuya ÚLTIMA valoración cae dentro de él; la primera puede ser anterior (se usa todo el historial).
//  · Primera = la primera fila de la fecha más antigua; última = la última fila de la fecha más reciente (orden de la hoja).
//  · Cada variable usa los usuarios que tienen valor en la primera Y en la última; los demás se cuentan en `sinDato`.
// ================================================================================

const DASH_ANALGESICOS_NIVELES_ = 6;   // valores válidos 0 a 5

function dashValorEscala_(v, max) { return (typeof v === 'number' && isFinite(v) && v >= 0 && v <= max) ? v : null; }

/**
 * Resumen de una variable a partir de los pares [primera, última] de cada usuario.
 * `mejoraSube` = true si subir es mejorar (función); false si bajar es mejorar (dolor, analgésicos).
 */
function dashResumenEvolucion_(pares, mejoraSube) {
  const cambios = pares.map(p => Math.round((p[1] - p[0]) * 100) / 100);
  const media = arr => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length * 10) / 10 : null;
  let mejoran = 0, igual = 0, empeoran = 0;
  cambios.forEach(c => { if (c === 0) igual++; else if ((c > 0) === mejoraSube) mejoran++; else empeoran++; });
  // % de mejora de la media: (última − primera) ÷ primera si mejorar es subir (función); (primera − última) ÷ primera si es bajar (dolor, analgésicos).
  // Se calcula con las medias sin redondear; null si no hay casos o la media de la primera es 0.
  const sP = pares.reduce((t, p) => t + p[0], 0), sU = pares.reduce((t, p) => t + p[1], 0);
  const pctMejoraMedia = sP > 0 ? Math.round((mejoraSube ? sU - sP : sP - sU) / sP * 1000) / 10 : null;
  return {
    n: pares.length, primera: media(pares.map(p => p[0])), ultima: media(pares.map(p => p[1])), cambio: dashResumen_(cambios), pctMejoraMedia: pctMejoraMedia,
    mejoran: mejoran, igual: igual, empeoran: empeoran
  };
}

/**
 * Cálculo de D4. Las valoraciones llegan ya filtradas por usuario (Gravedad, Tipo de Ingreso, Patología), solo con ID de usuario y
 * fecha válida, en el orden de la hoja.
 * @param {{valoraciones:Array<{idPaciente:string,fecha:string,dolor:?number,funcion:?number,analg:?number}>, desde:string, hasta:string}} e
 */
function dashCalcularEvolucion_(e) {
  const porUsuario = Object.create(null);
  e.valoraciones.forEach(v => { (porUsuario[v.idPaciente] = porUsuario[v.idPaciente] || []).push(v); });

  let usuarios = 0, enPeriodo = 0, sinComparar = 0;
  const dolor = [], funcion = [], analg = [], dias = [];
  let mejoranG = 0, igualG = 0, empeoranG = 0, nG = 0;
  const niveles = [];
  for (let i = 0; i < DASH_ANALGESICOS_NIVELES_; i++) niveles.push({ nivel: i, primera: 0, ultima: 0 });

  Object.keys(porUsuario).forEach(id => {
    const filas = porUsuario[id];
    usuarios++;
    let primera = filas[0], ultima = filas[0];
    filas.forEach(f => { if (f.fecha < primera.fecha) primera = f; if (f.fecha >= ultima.fecha) ultima = f; });
    if (!(ultima.fecha >= e.desde && ultima.fecha <= e.hasta)) return;
    enPeriodo++;
    if (primera.fecha === ultima.fecha) { sinComparar++; return; }

    const d0 = dashValorEscala_(primera.dolor, 10), d1 = dashValorEscala_(ultima.dolor, 10);
    const f0 = dashValorEscala_(primera.funcion, 10), f1 = dashValorEscala_(ultima.funcion, 10);
    const a0 = dashValorEscala_(primera.analg, DASH_ANALGESICOS_NIVELES_ - 1), a1 = dashValorEscala_(ultima.analg, DASH_ANALGESICOS_NIVELES_ - 1);
    const hayDolor = d0 !== null && d1 !== null, hayFuncion = f0 !== null && f1 !== null, hayAnalg = a0 !== null && a1 !== null;
    if (hayDolor) dolor.push([d0, d1]);
    if (hayFuncion) funcion.push([f0, f1]);
    if (hayAnalg) { analg.push([a0, a1]); niveles[Math.round(a0)].primera++; niveles[Math.round(a1)].ultima++; }
    dias.push(dashDiasEntre_(primera.fecha, ultima.fecha));

    if (hayDolor || hayFuncion) {
      nG++;
      const mejora = (hayDolor && d1 < d0) || (hayFuncion && f1 > f0);
      const empeora = !mejora && ((hayDolor && d1 > d0) || (hayFuncion && f1 < f0));
      if (mejora) mejoranG++; else if (empeora) empeoranG++; else igualG++;
    }
  });

  const comparables = enPeriodo - sinComparar;
  const dol = dashResumenEvolucion_(dolor, false), fun = dashResumenEvolucion_(funcion, true), ana = dashResumenEvolucion_(analg, false);
  dol.sinDato = comparables - dol.n; fun.sinDato = comparables - fun.n; ana.sinDato = comparables - ana.n;
  ana.niveles = niveles;
  return {
    usuariosConValoraciones: usuarios, enPeriodo: enPeriodo, sinComparar: sinComparar, comparables: comparables, diasEntre: dashResumen_(dias),
    global: { n: nG, sinDato: comparables - nG, mejoran: mejoranG, igual: igualG, empeoran: empeoranG, pctMejoran: dashPct_(mejoranG, nG) },
    dolor: dol, funcion: fun, analgesicos: ana
  };
}

// ================================================================================
// D4b — flujo de estados
// ================================================================================
// Fuente: hoja «Historial Estado» (usuarios/Historial_Estado.gs). Reglas (fáciles de cambiar aquí):
//  · Solo cuentan los cambios REALES del campo Estado: las filas de «Siembra» (estado de partida y episodios de la HC) no son
//    cambios y se dejan fuera; por eso el flujo solo tiene datos desde que se empezó a registrar (`datos.desde`).
//  · Entradas por mes = cambios reales en el periodo, contados por el estado al que entran (incluye «Nuevo usuario»).
//  · Transiciones = cambios reales en el periodo con estado anterior conocido, de un estado a otro distinto.
//  · Tiempo en un estado = días entre entrar en él y salir de él, de estancias CERRADAS por dos cambios reales consecutivos del
//    mismo usuario; la estancia cuenta en el periodo en el que SALE. Las abiertas (siguen en ese estado) y las que empezaron
//    antes del primer registro real no se miden. Si el estado anterior de un cambio no coincide con el nuevo del cambio previo, no se mide.
//  · Estado actual = reparto de los usuarios (filtrados) por el Estado que tienen hoy en la Maestra.
// ================================================================================

const DASH_ESTADOS_ = [
  { clase: 'activo', etiqueta: 'Activo' }, { clase: 'espera', etiqueta: 'En espera' }, { clase: 'contactara', etiqueta: 'Contactará' },
  { clase: 'noresponde', etiqueta: 'No responde' }, { clase: 'alta', etiqueta: 'Alta' }
];
const DASH_MAX_TRANSICIONES_ = 10;

/** Clase de un texto de Estado ('🟢 Activo' → 'activo'); '' si está vacío y 'otro' si no se reconoce. Los emojis no importan. */
function dashClaseEstado_(texto) {
  const t = dashSinTildes_(texto);
  if (!t) return '';
  if (t.indexOf('responde') !== -1) return 'noresponde';
  if (t.indexOf('activo') !== -1) return 'activo';
  if (t.indexOf('espera') !== -1) return 'espera';
  if (t.indexOf('alta') !== -1) return 'alta';
  if (t.indexOf('contactar') !== -1) return 'contactara';
  return 'otro';
}

function dashEtiquetaEstado_(clase) {
  for (let i = 0; i < DASH_ESTADOS_.length; i++) if (DASH_ESTADOS_[i].clase === clase) return DASH_ESTADOS_[i].etiqueta;
  return 'Otro';
}

/**
 * Cálculo de D4b. Todo llega ya filtrado por usuario (Gravedad, Tipo de Ingreso, Patología).
 * @param {{cambios:Array<{idPaciente:string,ts:number,fecha:string,antes:string,despues:string,siembra:boolean}>,
 *   estadosActuales:Array<{id:string,estado:string}>, desde:string, hasta:string, hoy:string}} e
 *   `cambios` = solo filas del campo Estado; `ts` = milisegundos (para ordenar) y `fecha` = 'yyyy-MM-dd'; `siembra` = fila de «Siembra».
 */
function dashCalcularFlujo_(e) {
  // Estado actual
  const actual = {};
  DASH_ESTADOS_.forEach(s => { actual[s.clase] = 0; });
  let otros = 0, sinEstado = 0;
  e.estadosActuales.forEach(u => {
    const c = dashClaseEstado_(u.estado);
    if (!c) sinEstado++; else if (actual[c] === undefined) otros++; else actual[c]++;
  });

  // Cambios reales
  const reales = e.cambios.filter(c => !c.siembra && c.fecha);
  const siembra = e.cambios.length - reales.length;
  const enPeriodo = reales.filter(c => c.fecha >= e.desde && c.fecha <= e.hasta);
  let primeraFecha = '';
  reales.forEach(c => { if (!primeraFecha || c.fecha < primeraFecha) primeraFecha = c.fecha; });

  // Entradas por mes
  const mesActual = e.hoy.slice(0, 7);
  const meses = dashMesesEntre_(e.desde, e.hasta).map(m => {
    const o = { mes: m, futuro: m > mesActual, total: 0 };
    DASH_ESTADOS_.forEach(s => { o[s.clase] = 0; });
    return o;
  });
  const indiceMes = {};
  meses.forEach((m, i) => { indiceMes[m.mes] = i; });
  let sinClasificar = 0;
  enPeriodo.forEach(c => {
    const clase = dashClaseEstado_(c.despues), i = indiceMes[c.fecha.slice(0, 7)];
    if (!clase || clase === 'otro') { sinClasificar++; return; }
    if (i !== undefined) { meses[i][clase]++; meses[i].total++; }
  });

  // Transiciones
  const pares = Object.create(null);
  let totalTransiciones = 0;
  enPeriodo.forEach(c => {
    const de = dashClaseEstado_(c.antes), a = dashClaseEstado_(c.despues);
    if (!de || !a || de === a) return;
    totalTransiciones++;
    const k = de + '>' + a;
    pares[k] = pares[k] || { de: de, a: a, deEtiqueta: dashEtiquetaEstado_(de), aEtiqueta: dashEtiquetaEstado_(a), n: 0 };
    pares[k].n++;
  });
  const lista = Object.keys(pares).map(k => pares[k]).sort((x, y) => y.n - x.n || (x.deEtiqueta + x.aEtiqueta).localeCompare(y.deEtiqueta + y.aEtiqueta));

  // Tiempo en cada estado
  const porUsuario = Object.create(null);
  reales.forEach(c => { (porUsuario[c.idPaciente] = porUsuario[c.idPaciente] || []).push(c); });
  const estancias = {};
  DASH_ESTADOS_.forEach(s => { estancias[s.clase] = []; });
  let incoherentes = 0, abiertas = 0;
  Object.keys(porUsuario).forEach(id => {
    const filas = porUsuario[id].slice().sort((x, y) => x.ts - y.ts);
    for (let i = 0; i < filas.length; i++) {
      const entra = dashClaseEstado_(filas[i].despues);
      if (!entra || entra === 'otro') continue;
      const sig = filas[i + 1];
      if (!sig) { abiertas++; continue; }
      if (dashClaseEstado_(sig.antes) !== entra) { incoherentes++; continue; }
      if (sig.fecha < e.desde || sig.fecha > e.hasta) continue;
      const d = dashDiasEntre_(filas[i].fecha, sig.fecha);
      if (d !== null && d >= 0 && estancias[entra]) estancias[entra].push(d);
    }
  });
  const tiempoEnEstado = DASH_ESTADOS_.map(s => ({ clase: s.clase, etiqueta: s.etiqueta, n: estancias[s.clase].length, dias: dashResumen_(estancias[s.clase]) }));

  return {
    estadoActual: {
      total: e.estadosActuales.length - sinEstado,
      items: DASH_ESTADOS_.map(s => ({ clase: s.clase, etiqueta: s.etiqueta, n: actual[s.clase] })), otros: otros, sinEstado: sinEstado
    },
    entradasPorMes: { meses: meses, total: meses.reduce((s, m) => s + m.total, 0), sinClasificar: sinClasificar },
    transiciones: { total: totalTransiciones, lista: lista.slice(0, DASH_MAX_TRANSICIONES_), distintas: lista.length },
    tiempoEnEstado: tiempoEnEstado,
    datos: { desde: primeraFecha, cambiosReales: reales.length, cambiosEnPeriodo: enPeriodo.length, filasSiembra: siembra, estanciasAbiertas: abiertas, estanciasIncoherentes: incoherentes }
  };
}

// ================================================================================
// D5 — DIAGNÓSTICOS (CONTEXTO.md, sección 15)
// ================================================================================
// Reglas (fáciles de cambiar aquí):
//  · Un usuario con dos patologías cuenta en las dos (y una sola vez en cada zona).
//  · «Usuarios» de cada patología = usuarios con algún episodio cuyo INGRESO cae en el periodo. Las otras columnas usan sus propias reglas,
//    las mismas que sus gráficas de siempre: duración y sesiones = episodios con ALTA en el periodo (D2); % que mejoran = usuarios cuya
//    ÚLTIMA valoración cae en el periodo (D4). Cada una lleva su propio «n».
//  · Las patologías que no están en la lista oficial se agrupan en `noReconocidos`; los usuarios sin patología en `sinDiagnostico`.
// ================================================================================

const DASH_POCOS_DATOS_ = 5;   // por debajo de este n, la tabla avisa de «pocos datos»

/**
 * Cálculo de D5. Todo llega ya filtrado por Gravedad y Tipo de Ingreso (NO por patología ni zona: es lo que se desglosa).
 * @param {{pacientes:Array<{id:string,patologias:string[],zonas:string[],enEspera:boolean,inscripcion:string}>, episodios:Array, citas:Array,
 *   valoraciones:Array, lista:Array<{nombre:string,codigo:string,grupo:string}>, zonas:string[], desde:string, hasta:string, hoy:string,
 *   cursoInicio:string, norm:function(string):string}} e   `lista` = lista oficial; `norm` = quita tildes y mayúsculas.
 */
function dashCalcularDiagnosticos_(e) {
  const enPeriodo = f => !!f && f >= e.desde && f <= e.hasta;
  const conIngreso = Object.create(null);
  e.episodios.forEach(ep => { if (enPeriodo(ep.ingreso)) conIngreso[ep.idPaciente] = true; });

  const porClave = Object.create(null);
  e.lista.forEach(p => { porClave[e.norm(p.nombre)] = { p: p, ids: [], usuarios: 0 }; });
  const zonaN = Object.create(null);
  e.zonas.forEach(z => { zonaN[z] = 0; });
  let usuarios = 0, sinDiagnostico = 0, noReconocidos = 0;

  e.pacientes.forEach(u => {
    const claves = [];
    let desconocida = false;
    u.patologias.forEach(n => { const k = e.norm(n); if (porClave[k]) { if (claves.indexOf(k) === -1) claves.push(k); } else desconocida = true; });
    claves.forEach(k => { porClave[k].ids.push(u.id); });
    const entra = conIngreso[u.id] === true;
    if (!entra) return;
    usuarios++;
    if (!u.patologias.length) sinDiagnostico++;
    else if (desconocida && !claves.length) noReconocidos++;
    claves.forEach(k => { porClave[k].usuarios++; });
    u.zonas.forEach(z => { if (z in zonaN) zonaN[z]++; });
  });

  const filas = [];
  Object.keys(porClave).forEach(k => {
    const g = porClave[k];
    if (!g.ids.length) return;
    const set = Object.create(null);
    g.ids.forEach(id => { set[id] = true; });
    const pacs = e.pacientes.filter(u => set[u.id] === true);
    const pr = dashCalcularPacientes_({
      pacientes: pacs, episodios: e.episodios.filter(ep => set[ep.idPaciente] === true), citas: e.citas.filter(c => set[c.idPaciente] === true),
      desde: e.desde, hasta: e.hasta, hoy: e.hoy, cursoInicio: e.cursoInicio
    });
    const ev = dashCalcularEvolucion_({ valoraciones: e.valoraciones.filter(v => set[v.idPaciente] === true), desde: e.desde, hasta: e.hasta });
    if (!g.usuarios && !pr.duracion.n && !ev.global.n) return;
    filas.push({
      nombre: g.p.nombre, codigo: g.p.codigo, zona: g.p.grupo, usuarios: g.usuarios,
      duracion: { n: pr.duracion.n, media: pr.duracion.dias.media },
      sesiones: { n: pr.sesiones.n, media: pr.sesiones.porEpisodio.media },
      mejora: { n: ev.global.n, mejoran: ev.global.mejoran, pct: ev.global.pctMejoran }
    });
  });
  filas.sort((a, b) => b.usuarios - a.usuarios || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    usuarios: usuarios, sinDiagnostico: sinDiagnostico, noReconocidos: noReconocidos, pocosDatos: DASH_POCOS_DATOS_,
    patologias: filas, zonas: e.zonas.map(z => ({ zona: z, n: zonaN[z] }))
  };
}
