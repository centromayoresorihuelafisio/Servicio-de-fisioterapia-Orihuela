/**
 * MIGRACIÓN DE LA AGENDA A LA TABLA PLANA "Citas"
 * Paso 6 de CONTEXTO.md, sección 11, FASE 1. Copia sin borrar: la Agenda no se toca nunca.
 *
 * Qué copia: solo el curso actual (`obtenerHojaAgenda`; los cursos anteriores se descartan a propósito, decisión del dueño).
 * Una fila de "Citas" por cada fila de la Agenda con Usuario y con Fecha legible. Los huecos libres, las etiquetas de
 * semana/día y los banners no se copian. Teléfono y enlace a la HC no se copian (se consultan por ID paciente).
 *
 * Cómo enlaza cada cita con su usuario (por niveles, con la misma lógica que el diagnóstico `diagnosticarRediseno`):
 *   seguro   = nombre y teléfono coinciden con un único usuario → se guarda su ID paciente.
 *   probable = el nombre existe una sola vez en la Maestra pero el teléfono no lo confirma → se guarda su ID paciente y se
 *              LISTA en el informe para que lo compruebes.
 *   ambiguo / sin usuario (varios usuarios con ese nombre, o ya no existe) → se copia con el ID paciente VACÍO y se lista.
 * La Asistencia se convierte a una de las 4 categorías (ASISTIDO, NO ASISTIDO, JUSTIFICADA, PENDIENTE; `citasCategoriaAsistencia_`);
 * una celda vacía cuenta como Pendiente; lo que no sea uno de los 4 textos oficiales se lista en el informe.
 * "Creada el" queda vacío (no se puede reconstruir).
 *
 * Funciones (desde el editor de Apps Script, sin menú):
 *   1. `previsualizarMigracionCitas`: SOLO LECTURA. Escribe únicamente el informe "Citas Migración" (resumen + casos a revisar).
 *   2. `migrarCitas`: regenera la hoja "Citas" desde la Agenda, la relee para verificarla y deja el informe. Se puede repetir
 *      (cada vez regenera la copia, con IDs de cita nuevos: hasta el corte nada usa esos IDs). SE NIEGA si en "Citas" hay alguna
 *      fila con "Creada el" rellena, porque eso significa que la app ya ha escrito citas ahí y regenerar las borraría.
 *   3. `compararCitasConAgenda`: SOLO LECTURA. Comprueba si "Citas" sigue igual que la Agenda (mientras la Agenda se siga
 *      usando, "Citas" se queda atrás con cada cita nueva) y avisa de las diferencias. Úsala justo antes del corte.
 *
 * Reutiliza SIN modificar: diagRed_leerMaestra_ y diagRed_clasificarCita_ (herramientas/Diagnostico_Rediseno.gs), hcNorm_, hcAISO_,
 * hcDigitos_ (historia/HC_Web.gs), mapaFilasMaestraPorId_ (core/Utils.gs), obtenerHojaAgenda, citasHoja_, citasLeer_,
 * citasCategoriaAsistencia_, citasHoraTexto_ (agenda/Citas_Datos.gs). Es una herramienta temporal: se puede borrar tras el corte
 * (la hoja "Citas Migración" también). Prefijo migCitas_ / MIG_CITAS_.
 */

const MIG_CITAS_ = { HOJA_INFORME: 'Citas Migración', MAX_LISTA: 500, ANCHO_INFORME: 7 };

// ----------------------------------------------------------------------------- plan (solo lectura)

/** Usuario de la Maestra al que se enlaza una cita, según la clase que devolvió diagRed_clasificarCita_. */
function migCitas_usuarioEnlazado_(candidatos, tel, clase) {
  if (clase === 'seguro') return candidatos.filter(function (u) { return u.digs.indexOf(tel) !== -1; })[0] || null;
  if (clase === 'probable') return candidatos[0] || null;
  return null;
}

/**
 * Lee la Agenda del curso actual y la Maestra y devuelve lo que se copiaría, sin escribir nada.
 * @return {{hoja:string, citas:Object[], revisar:Object[], resumen:Object}}
 */
function migCitas_plan_() {
  const ss = getSS(), tz = Session.getScriptTimeZone();
  const hoja = obtenerHojaAgenda();
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');

  // Usuarios de la Maestra e ID paciente por fila real.
  const usuarios = diagRed_leerMaestra_(ss, tz);
  const mapaId = mapaFilasMaestraPorId_(maestra), idPorFila = {};
  Object.keys(mapaId).forEach(function (id) { idPorFila[mapaId[id]] = id; });
  const porNombre = {};
  usuarios.forEach(function (u) { (porNombre[u.nombreNorm] = porNombre[u.nombreNorm] || []).push(u); });

  const ult = hoja.getLastRow(), nc = hoja.getLastColumn();
  if (ult < 2) throw new Error('La hoja "' + hoja.getName() + '" no tiene filas.');
  const valores = hoja.getRange(1, 1, ult, nc).getValues();
  const cab = valores[0].map(function (h) { return String(h).trim(); });
  const col = function (n) { return cab.indexOf(n); };
  const cF = col(COLUMNAS.AGENDA.FECHA), cH = col(COLUMNAS.AGENDA.HORA), cU = col(COLUMNAS.AGENDA.USUARIO);
  if (cF === -1 || cH === -1 || cU === -1) throw new Error('A la Agenda le faltan las columnas "' + COLUMNAS.AGENDA.FECHA + '", "' + COLUMNAS.AGENDA.HORA + '" o "' + COLUMNAS.AGENDA.USUARIO + '".');
  const cT = col(COLUMNAS.AGENDA.TELEFONO), cS = col(COLUMNAS.AGENDA.SESION), cA = col(COLUMNAS.AGENDA.ASISTENCIA),
        cE = col(COLUMNAS.AGENDA.ID_EVENTO_CALENDAR), cN = col(COLUMNAS.AGENDA.NOTAS);
  const dato = function (f, c) { return c === -1 || f[c] === null || f[c] === undefined ? '' : f[c]; };

  const resumen = {
    filasConUsuario: 0, copiadas: 0, sinFecha: 0, seguro: 0, probable: 0, ambiguo: 0, sin: 0, horaIlegible: 0,
    asistenciaVacia: 0, asistenciaNoEstandar: 0, duplicadosFechaHora: 0
  };
  Object.keys(ASISTENCIA_CITA).forEach(function (k) { resumen[ASISTENCIA_CITA[k]] = 0; });
  const citas = [], revisar = [], noEstandar = {}, porFechaHora = {};
  const aviso = function (nivel, f, fechaISO, hora, nombre, tel, detalle) {
    revisar.push({ nivel: nivel, fila: f, fecha: fechaISO, hora: hora, nombre: nombre, tel: tel, detalle: detalle });
  };

  for (let i = 1; i < valores.length; i++) {
    const f = valores[i];
    const nombre = String(dato(f, cU)).trim();
    if (!nombre) continue;                       // hueco libre, banner o etiqueta
    resumen.filasConUsuario++;
    const fechaISO = hcAISO_(f[cF], tz);
    const tel = hcDigitos_(dato(f, cT));
    if (!fechaISO) { resumen.sinFecha++; aviso('Sin fecha legible (NO copiada)', i + 1, '', '', nombre, tel, 'Fila con usuario pero sin fecha'); continue; }
    const hora = citasHoraTexto_(f[cH], tz);
    if (!hora) { resumen.horaIlegible++; aviso('Hora no legible (copiada sin hora)', i + 1, fechaISO, '', nombre, tel, 'Valor de la celda de hora: ' + String(dato(f, cH))); }

    const candidatos = porNombre[hcNorm_(nombre)] || [];
    const cl = diagRed_clasificarCita_(candidatos, tel);
    resumen[cl.clase]++;
    const u = migCitas_usuarioEnlazado_(candidatos, tel, cl.clase);
    const idPaciente = u ? (idPorFila[u.fila] || '') : '';
    if (cl.clase === 'probable') aviso('Probable (enlazada: comprobar)', i + 1, fechaISO, hora, nombre, tel, cl.detalle);
    else if (cl.clase === 'ambiguo') aviso('Ambiguo (sin enlazar)', i + 1, fechaISO, hora, nombre, tel, cl.detalle);
    else if (cl.clase === 'sin') aviso('Sin usuario (sin enlazar)', i + 1, fechaISO, hora, nombre, tel, 'No hay nadie con ese nombre en la Maestra');
    if (u && !idPaciente) aviso('Usuario sin ID paciente (sin enlazar)', i + 1, fechaISO, hora, nombre, tel, 'Maestra fila ' + u.fila + ': ejecuta asignarIdsPaciente');

    const asisTexto = String(dato(f, cA)).trim();
    const cat = citasCategoriaAsistencia_(asisTexto);
    resumen[cat.categoria]++;
    if (cat.vacio) resumen.asistenciaVacia++;
    else if (!cat.estandar) { resumen.asistenciaNoEstandar++; const k = asisTexto + ' → ' + (cat.desconocido ? 'Pendiente (NO RECONOCIDO)' : cat.categoria); noEstandar[k] = (noEstandar[k] || 0) + 1; }

    if (hora) { const k = fechaISO + ' ' + hora; (porFechaHora[k] = porFechaHora[k] || []).push(nombre); }

    citas.push({
      filaAgenda: i + 1, fechaISO: fechaISO, hora: hora, idPaciente: idPaciente, nombre: nombre,
      sesion: dato(f, cS), asistencia: cat.categoria, notas: String(dato(f, cN)), idEvento: String(dato(f, cE)).trim()
    });
    resumen.copiadas++;
  }

  Object.keys(noEstandar).forEach(function (k) { aviso('Asistencia no estándar', '', '', '', k, '', noEstandar[k] + ' cita(s)'); });
  Object.keys(porFechaHora).forEach(function (k) {
    if (porFechaHora[k].length > 1) { resumen.duplicadosFechaHora++; aviso('Misma fecha y hora repetida', '', k.slice(0, 10), k.slice(11), porFechaHora[k].join(' / '), '', porFechaHora[k].length + ' citas a la misma hora'); }
  });

  citas.sort(function (a, b) {
    return a.fechaISO === b.fechaISO ? (a.hora === b.hora ? a.filaAgenda - b.filaAgenda : (a.hora < b.hora ? -1 : 1)) : (a.fechaISO < b.fechaISO ? -1 : 1);
  });
  return { hoja: hoja.getName(), citas: citas, revisar: revisar, resumen: resumen };
}

/** Clave de comparación de una cita (la misma para lo planificado y para lo leído de la hoja "Citas"). */
function migCitas_clave_(fechaISO, hora, idPaciente, nombre, sesion, asistencia, notas, idEvento) {
  return [fechaISO, hora, idPaciente, nombre, sesion === null || sesion === undefined ? '' : String(sesion), asistencia, String(notas || '').trim(), idEvento].join('\u0001');
}

/** Compara lo planificado con lo que hay en "Citas": { faltan: [...], sobran: [...] } (claves legibles). */
function migCitas_diferencias_(plan, enHoja) {
  const cuenta = {};
  plan.citas.forEach(function (c) {
    const k = migCitas_clave_(c.fechaISO, c.hora, c.idPaciente, c.nombre, c.sesion, c.asistencia, c.notas, c.idEvento);
    cuenta[k] = (cuenta[k] || 0) + 1;
  });
  const sobran = [];
  enHoja.forEach(function (c) {
    const k = migCitas_clave_(c.fecha, c.hora, c.idPaciente, c.nombre, c.sesion, c.asistencia, c.notas, c.idEvento);
    if (cuenta[k]) cuenta[k]--; else sobran.push(c.fecha + ' ' + c.hora + ' · ' + c.nombre + ' · ' + c.asistencia);
  });
  const faltan = [];
  plan.citas.forEach(function (c) {
    const k = migCitas_clave_(c.fechaISO, c.hora, c.idPaciente, c.nombre, c.sesion, c.asistencia, c.notas, c.idEvento);
    if (cuenta[k]) { cuenta[k]--; faltan.push(c.fechaISO + ' ' + c.hora + ' · ' + c.nombre + ' · ' + c.asistencia + ' (fila ' + c.filaAgenda + ' de la Agenda)'); }
  });
  return { faltan: faltan, sobran: sobran };
}

// ----------------------------------------------------------------------------- informe

function migCitas_informe_(plan, titulo, extra) {
  const ss = getSS();
  let h = ss.getSheetByName(MIG_CITAS_.HOJA_INFORME);
  if (!h) h = ss.insertSheet(MIG_CITAS_.HOJA_INFORME, ss.getNumSheets()); else h.clear();
  const W = MIG_CITAS_.ANCHO_INFORME, r = plan.resumen, filas = [];
  const linea = function (a, b) { const x = [a, b === undefined ? '' : b]; while (x.length < W) x.push(''); filas.push(x); };
  linea(titulo);
  linea('Agenda leída', plan.hoja);
  linea('Fecha del informe', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'));
  linea('');
  linea('RESUMEN');
  linea('Filas de la Agenda con usuario', r.filasConUsuario);
  linea('Citas copiadas', r.copiadas);
  linea('No copiadas (sin fecha legible)', r.sinFecha);
  linea('Enlazadas con seguridad (nombre + teléfono)', r.seguro);
  linea('Enlazadas por nombre único (comprobar)', r.probable);
  linea('Ambiguas (sin enlazar)', r.ambiguo);
  linea('Sin usuario en la Maestra (sin enlazar)', r.sin);
  Object.keys(ASISTENCIA_CITA).forEach(function (k) { linea('Asistencia: ' + ASISTENCIA_CITA[k], r[ASISTENCIA_CITA[k]]); });
  linea('Asistencia vacía (cuenta como Pendiente)', r.asistenciaVacia);
  linea('Asistencia con texto no estándar', r.asistenciaNoEstandar);
  linea('Hora no legible', r.horaIlegible);
  linea('Fechas y horas repetidas', r.duplicadosFechaHora);
  (extra || []).forEach(function (e) { linea(e[0], e[1]); });
  linea('');
  linea('CASOS A REVISAR (' + plan.revisar.length + (plan.revisar.length > MIG_CITAS_.MAX_LISTA ? ', se muestran ' + MIG_CITAS_.MAX_LISTA : '') + ')');
  filas.push(['Caso', 'Fila Agenda', 'Fecha', 'Hora', 'Nombre', 'Teléfono (9 dígitos)', 'Detalle']);
  plan.revisar.slice(0, MIG_CITAS_.MAX_LISTA).forEach(function (a) { filas.push([a.nivel, a.fila, a.fecha, a.hora, a.nombre, a.tel, a.detalle]); });
  const rango = h.getRange(1, 1, filas.length, W);
  rango.setNumberFormat('@');
  rango.setValues(filas);
  h.getRange(1, 1, 1, 1).setFontWeight('bold');
  h.setColumnWidth(1, 330); h.setColumnWidth(2, 120); h.setColumnWidth(5, 260); h.setColumnWidth(7, 420);
}

// ----------------------------------------------------------------------------- funciones para el editor

/** SOLO LECTURA: qué se copiaría. Escribe únicamente el informe "Citas Migración". */
function previsualizarMigracionCitas() {
  const plan = migCitas_plan_();
  migCitas_informe_(plan, 'PREVISUALIZACIÓN: no se ha escrito nada en "' + SHEETS.CITAS + '"');
  Logger.log('Previsualización de la migración de citas: ' + JSON.stringify(plan.resumen));
  getSS().toast(plan.resumen.copiadas + ' citas se copiarían; ' + plan.revisar.length + ' casos a revisar (hoja "' + MIG_CITAS_.HOJA_INFORME + '")', 'Citas', 8);
  return plan.resumen;
}

/** Regenera la hoja "Citas" desde la Agenda del curso actual, la verifica y deja el informe. La Agenda no se toca. */
function migrarCitas() {
  const existente = citasHoja_(false);
  if (existente && existente.getLastRow() >= 2) {
    const cab = existente.getRange(1, 1, 1, existente.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    const cCreada = cab.indexOf(COLUMNAS.CITAS.CREADA);
    if (cCreada !== -1 && existente.getRange(2, cCreada + 1, existente.getLastRow() - 1, 1).getValues().some(function (r) { return String(r[0]).trim(); })) {
      throw new Error('La hoja "' + SHEETS.CITAS + '" ya tiene citas creadas desde la app ("' + COLUMNAS.CITAS.CREADA + '" rellena). No se regenera para no borrarlas.');
    }
  }

  const plan = migCitas_plan_();
  const hoja = citasHoja_(true);
  const cab = citasCabeceras_();
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  if (hoja.getLastRow() >= 2) hoja.getRange(2, 1, hoja.getLastRow() - 1, cab.length).clearContent();

  const n = plan.citas.length;
  if (n) {
    const filas = plan.citas.map(function (c) {
      const p = c.fechaISO.split('-');
      return [Utilities.getUuid(), new Date(+p[0], +p[1] - 1, +p[2]), c.hora, c.idPaciente, c.nombre, c.sesion, c.asistencia, c.notas, c.idEvento, ''];
    });
    // Texto plano salvo fechas y Sesión (así Sheets no convierte horas, notas ni IDs). Los formatos van ANTES de escribir los valores.
    [1, 3, 4, 5, 7, 8, 9].forEach(function (c) { hoja.getRange(2, c, n, 1).setNumberFormat('@'); });
    hoja.getRange(2, 2, n, 1).setNumberFormat('dd/MM/yyyy');
    hoja.getRange(2, 10, n, 1).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    hoja.getRange(2, 1, n, cab.length).setValues(filas);
  }

  // Verificación: se vuelve a leer "Citas" y se compara con lo planificado.
  const dif = migCitas_diferencias_(plan, citasLeer_());
  const ok = dif.faltan.length === 0 && dif.sobran.length === 0;
  const extra = [['Escritas en "' + SHEETS.CITAS + '"', n], ['Verificación', ok ? 'OK' : 'FALLO: ' + dif.faltan.length + ' faltan, ' + dif.sobran.length + ' sobran']];
  migCitas_informe_(plan, 'MIGRACIÓN HECHA: "' + SHEETS.CITAS + '" regenerada desde la Agenda (la Agenda no se ha tocado)', extra);
  Logger.log('Migración de citas: ' + JSON.stringify(plan.resumen) + ' · verificación ' + (ok ? 'OK' : 'FALLO'));
  getSS().toast('Citas migradas: ' + n + ' (' + (ok ? 'verificación OK' : 'VERIFICACIÓN CON FALLOS') + '). Revisa la hoja "' + MIG_CITAS_.HOJA_INFORME + '".', 'Citas', 10);
  return { escritas: n, verificacion: ok ? 'OK' : 'FALLO', resumen: plan.resumen };
}

/** SOLO LECTURA: ¿"Citas" sigue igual que la Agenda del curso actual? Avisa de las citas que faltan o sobran. */
function compararCitasConAgenda() {
  const plan = migCitas_plan_();
  const dif = migCitas_diferencias_(plan, citasLeer_());
  const res = { enAgenda: plan.citas.length, faltanEnCitas: dif.faltan.length, sobranEnCitas: dif.sobran.length };
  Logger.log('Comparación Citas / Agenda: ' + JSON.stringify(res));
  dif.faltan.slice(0, 40).forEach(function (t) { Logger.log(' - FALTA en Citas: ' + t); });
  dif.sobran.slice(0, 40).forEach(function (t) { Logger.log(' - SOBRA en Citas: ' + t); });
  getSS().toast(dif.faltan.length || dif.sobran.length ? dif.faltan.length + ' faltan y ' + dif.sobran.length + ' sobran en "Citas" (mira el registro de ejecuciones)' : 'Citas coincide con la Agenda', 'Citas', 8);
  return res;
}
