// =====================================================================================
// herramientas/Cerrar_Episodios_Olvidados.gs
// Herramienta de UN SOLO USO (13-nov-2026, decisión del dueño): cierra los episodios de la historia clínica que se
// quedaron abiertos por olvido (sin fecha de alta) y que empezaron hace más de 8 meses. Fecha de alta = inicio + 3 meses.
//
// Desde el editor de Apps Script (mejor sin usar la web app durante unos segundos):
//   1. `revisarEpisodiosOlvidados`: SOLO LECTURA. Crea (o rehace) la pestaña «Revisión episodios» con cada episodio
//      abierto que empezó hace más de 8 meses: usuario, estado actual, inicio, fecha de alta propuesta, citas después
//      de esa fecha, motivo y la columna «Aplicar».
//      · «Aplicar» = «Sí»: cierra el episodio y, si es el último de su historia, pasa al usuario a «Alta» como el botón
//        «Dar de alta» (Estado, Tipo de ingreso vacío, historial, «Última visita» = la fecha de alta y reordenar).
//      · «Aplicar» = «Solo episodio»: cierra el episodio y no toca el estado del usuario.
//      · Vacía: no se toca.
//      Viene con «Sí» solo lo claro: último episodio, usuario Activo (o ya en Alta) y sin citas después de la fecha de alta.
//      Lo demás (citas después, otro estado, sin usuario) viene vacío y en el grupo «Revisar»: decide el dueño.
//      La columna «Fecha de alta» se puede cambiar a mano antes de aplicar.
//   2. `aplicarEpisodiosOlvidados`: aplica solo las filas con «Aplicar». Se puede repetir sin peligro: un episodio que
//      ya tiene alta no se toca. Cada cambio queda en «Registro» como `aplicarEpisodiosOlvidados`.
// Al terminar se retira este archivo (como la herramienta de nombres, sección 22). Prefijo epiOlv para el ámbito global.
// =====================================================================================

const EPI_OLV_HOJA_ = 'Revisión episodios';
const EPI_OLV_MESES_ABIERTO_ = 8;   // episodios abiertos que empezaron hace más de esto
const EPI_OLV_MESES_ALTA_ = 3;      // fecha de alta = inicio + esto
const EPI_OLV_CABECERAS_ = ['ID HC', 'ID paciente', 'Grupo', 'Usuario', 'Estado actual', 'Inicio', 'Fecha de alta',
  'Citas después del alta', 'Última cita', 'Motivo', 'Aplicar', 'Resultado'];
const EPI_OLV_COL_ = { ID_HC: 0, ID: 1, GRUPO: 2, USUARIO: 3, ESTADO: 4, INICIO: 5, ALTA: 6, CITAS: 7, ULTIMA: 8,
  MOTIVO: 9, APLICAR: 10, RESULTADO: 11 };

/** 'yyyy-MM-dd' + n meses; si el día no existe en ese mes, el último día del mes (30-nov + 3 = 28 o 29-feb). */
function epiOlvSumarMeses_(iso, n) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const total = (+m[1]) * 12 + (+m[2] - 1) + n, a = Math.floor(total / 12), mes = total % 12;
  const ultimoDia = new Date(Date.UTC(a, mes + 1, 0)).getUTCDate();
  const d = Math.min(+m[3], ultimoDia);
  return a + '-' + ('0' + (mes + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
}
function epiOlvFechaTexto_(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }

/**
 * Lógica pura de la revisión (se prueba en comprobar/episodios.mjs).
 * `episodios` = [{ idHC, ingreso, alta }] (ISO o ''); `pacienteDeHC` = { idHC: idPaciente }; `usuarios` = { idPaciente:
 * { nombre, estado } } (estado sin emoji); `citas` = { idPaciente: ['yyyy-MM-dd', ...] }; `hoyISO`.
 * Devuelve { filas, resumen }: filas de la pestaña (sin cabecera), primero «Revisar» y luego «Listo», por usuario.
 */
function epiOlvCalcular_(episodios, pacienteDeHC, usuarios, citas, hoyISO) {
  const corte = epiOlvSumarMeses_(hoyISO, -EPI_OLV_MESES_ABIERTO_);
  const resumen = { abiertosAntiguos: 0, listos: 0, revisar: 0 };
  const filas = [];
  episodios.forEach(function (ep) {
    if (ep.alta || !ep.ingreso || ep.ingreso >= corte) return;
    resumen.abiertosAntiguos++;
    const posterior = episodios.some(function (o) { return o !== ep && o.idHC === ep.idHC && (!o.ingreso || o.ingreso > ep.ingreso); });
    const alta = epiOlvSumarMeses_(ep.ingreso, EPI_OLV_MESES_ALTA_);
    const id = pacienteDeHC[ep.idHC] || '';
    const u = id ? usuarios[id] : null;
    const despues = (id && citas[id] ? citas[id] : []).filter(function (f) { return f > alta; }).sort();
    const motivos = [];
    let aplicar = 'Sí';
    if (!id) { motivos.push('La historia no tiene ID paciente: no se sabe de quién es ni se pueden mirar sus citas'); aplicar = ''; }
    else if (!u) { motivos.push('El ID paciente de la historia no está en la Maestra'); aplicar = ''; }
    if (despues.length) {
      motivos.push('Tiene ' + despues.length + (despues.length === 1 ? ' cita' : ' citas') + ' después de la fecha de alta: quizá sigue en tratamiento');
      aplicar = '';
    }
    if (posterior) {
      motivos.push('La historia tiene un episodio posterior: con «Sí» solo se cierra este episodio');
    } else if (u && u.estado === ESTADOS_PACIENTE.ALTA) {
      motivos.push('Ya está en Alta: solo se cierra el episodio');
    } else if (u && u.estado !== ESTADOS_PACIENTE.ACTIVO) {
      motivos.push('Estado «' + (u.estado || 'vacío') + '»: «Sí» lo pasa a Alta; «Solo episodio» no toca su estado');
      aplicar = '';
    }
    const grupo = aplicar ? 'Listo' : 'Revisar';
    resumen[aplicar ? 'listos' : 'revisar']++;
    filas.push([ep.idHC, id, grupo, u ? u.nombre : '', u ? u.estado : '', epiOlvFechaTexto_(ep.ingreso), epiOlvFechaTexto_(alta),
      despues.length || '', despues.length ? epiOlvFechaTexto_(despues[despues.length - 1]) : '', motivos.join('. '), aplicar, '']);
  });
  filas.sort(function (p, q) {
    return (p[EPI_OLV_COL_.GRUPO] === q[EPI_OLV_COL_.GRUPO] ? 0 : (p[EPI_OLV_COL_.GRUPO] === 'Revisar' ? -1 : 1)) ||
      String(p[EPI_OLV_COL_.USUARIO]).localeCompare(String(q[EPI_OLV_COL_.USUARIO]), 'es');
  });
  return { filas: filas, resumen: resumen };
}

/** Fecha escrita en la pestaña (fecha de la hoja o texto dd/mm/aaaa) → 'yyyy-MM-dd', o ''. */
function epiOlvLeerFecha_(v, tz) { return hcAISO_(v, tz); }

/** Lee todo lo que necesita la revisión: episodios (con su fila), HC → paciente, usuarios y columnas de la Maestra. */
function epiOlvLeer_() {
  const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
  const ultE = h.epi.getLastRow();
  const episodios = (ultE > 1 ? h.epi.getRange(2, 1, ultE - 1, 3).getValues() : []).map(function (r, i) {
    return { fila: i + 2, idHC: String(r[0] == null ? '' : r[0]).trim(), ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz) };
  }).filter(function (e) { return e.idHC; });
  const pacienteDeHC = {};
  const ultH = h.hc.getLastRow();
  if (ultH > 1) {
    const ids = h.hc.getRange(2, HC_WEB_.COL.ID, ultH - 1, 1).getValues();
    const pacs = h.hc.getRange(2, HC_WEB_.COL.ID_PACIENTE, ultH - 1, 1).getValues();
    ids.forEach(function (r, i) {
      const idHC = String(r[0] == null ? '' : r[0]).trim();
      if (idHC) pacienteDeHC[idHC] = String(pacs[i][0] == null ? '' : pacs[i][0]).trim();
    });
  }
  const maestra = h.ss.getSheetByName(SHEETS.MAESTRA);
  if (!maestra) throw new Error('No se encontró la hoja «' + SHEETS.MAESTRA + '».');
  const cab = maestra.getRange(1, 1, 1, maestra.getLastColumn()).getValues()[0]
    .map(function (x) { return String(x).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); });
  const col = {
    nombre: obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.NOMBRE),
    estado: obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.ESTADO),
    tipo: obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.TIPO_INGRESO),
    id: obtenerIndiceColumnaPorNombre_(maestra, COLUMNAS.MAESTRA.ID_PACIENTE),
    ultima: cab.findIndex(function (x) { return x.indexOf('ultima visita') !== -1; })
  };
  if (col.nombre === -1 || col.estado === -1 || col.tipo === -1 || col.id === -1) {
    throw new Error('Faltan columnas en la Maestra («Nombre», «Estado», «Tipo de Ingreso» o «ID paciente»).');
  }
  const ultM = maestra.getLastRow();
  const usuarios = {}, filaDe = {};
  (ultM > 1 ? maestra.getRange(2, 1, ultM - 1, maestra.getLastColumn()).getValues() : []).forEach(function (f, i) {
    const id = String(f[col.id] || '').trim();
    if (!id || usuarios[id]) return;
    usuarios[id] = { nombre: String(f[col.nombre] || '').trim(), estado: textoSinEmoji_(f[col.estado]), estadoCelda: f[col.estado], tipo: f[col.tipo] };
    filaDe[id] = i + 2;
  });
  return { h: h, tz: tz, episodios: episodios, pacienteDeHC: pacienteDeHC, maestra: maestra, col: col, usuarios: usuarios, filaDe: filaDe };
}

/** Paso 1. SOLO LECTURA: rehace la pestaña «Revisión episodios». */
function revisarEpisodiosOlvidados() {
  soloPropietario_('revisarEpisodiosOlvidados');
  const d = epiOlvLeer_();
  const citas = {};
  citasLeer_().forEach(function (c) { if (c.idPaciente) (citas[c.idPaciente] = citas[c.idPaciente] || []).push(c.fecha); });
  const hoy = Utilities.formatDate(new Date(), d.tz, 'yyyy-MM-dd');
  const r = epiOlvCalcular_(d.episodios, d.pacienteDeHC, d.usuarios, citas, hoy);

  const ss = d.h.ss;
  let hoja = ss.getSheetByName(EPI_OLV_HOJA_);
  if (!hoja) hoja = ss.insertSheet(EPI_OLV_HOJA_);
  hoja.clear();
  hoja.getRange(1, 1, 1, EPI_OLV_CABECERAS_.length).setValues([EPI_OLV_CABECERAS_]).setFontWeight('bold');
  hoja.setFrozenRows(1);
  if (r.filas.length) {
    const rango = hoja.getRange(2, 1, r.filas.length, EPI_OLV_CABECERAS_.length);
    rango.setNumberFormat('@').setValues(r.filas).setVerticalAlignment('top');
    hoja.getRange(2, EPI_OLV_COL_.APLICAR + 1, r.filas.length, 1).setFontWeight('bold')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'Solo episodio'], true).setAllowInvalid(false).build());
  }
  [120, 120, 80, 280, 110, 90, 100, 90, 90, 420, 110, 300].forEach(function (w, i) { hoja.setColumnWidth(i + 1, w); });
  hoja.getRange(1, EPI_OLV_COL_.MOTIVO + 1, Math.max(1, r.filas.length + 1), 1).setWrap(true);
  hoja.hideColumns(EPI_OLV_COL_.ID_HC + 1, 2);

  Logger.log('Episodios abiertos que empezaron antes del ' + epiOlvFechaTexto_(epiOlvSumarMeses_(hoy, -EPI_OLV_MESES_ABIERTO_)) + ': ' +
    r.resumen.abiertosAntiguos + '. Listos (con «Sí»): ' + r.resumen.listos + '. Para revisar: ' + r.resumen.revisar +
    '. Mira la pestaña «' + EPI_OLV_HOJA_ + '», ajusta «Aplicar» y ejecuta aplicarEpisodiosOlvidados.');
}

/** Paso 2. Cierra los episodios con «Aplicar» y, con «Sí», pasa al usuario a Alta. Se puede repetir. */
function aplicarEpisodiosOlvidados() {
  soloPropietario_('aplicarEpisodiosOlvidados');
  const rev = getSS_().getSheetByName(EPI_OLV_HOJA_);
  if (!rev || rev.getLastRow() < 2) throw new Error('No hay pestaña «' + EPI_OLV_HOJA_ + '» con filas: ejecuta antes revisarEpisodiosOlvidados.');
  const filas = rev.getRange(2, 1, rev.getLastRow() - 1, EPI_OLV_CABECERAS_.length).getValues();
  const cuenta = { episodios: 0, altas: 0, saltados: 0 };
  const resultados = [];

  conBloqueoScript_(function () {
    const d = epiOlvLeer_();
    const hoy = Utilities.formatDate(new Date(), d.tz, 'yyyy-MM-dd');
    filas.forEach(function (f) {
      const aplicar = String(f[EPI_OLV_COL_.APLICAR] || '').trim();
      if (aplicar !== 'Sí' && aplicar !== 'Solo episodio') { resultados.push([f[EPI_OLV_COL_.RESULTADO] || '']); return; }
      const idHC = String(f[EPI_OLV_COL_.ID_HC] || '').trim();
      const inicio = epiOlvLeerFecha_(f[EPI_OLV_COL_.INICIO], d.tz);
      const alta = epiOlvLeerFecha_(f[EPI_OLV_COL_.ALTA], d.tz);
      if (!alta || alta < inicio || alta > hoy) { cuenta.saltados++; resultados.push(['«Fecha de alta» no válida (antes del inicio, futura o mal escrita): no se toca']); return; }
      const ep = d.episodios.filter(function (e) { return e.idHC === idHC && e.ingreso === inicio; })[0];
      if (!ep) { cuenta.saltados++; resultados.push(['No se encuentra el episodio en «Episodios HC»: vuelve a ejecutar revisarEpisodiosOlvidados']); return; }
      if (ep.alta) { resultados.push(['Ya tenía alta (' + epiOlvFechaTexto_(ep.alta) + '): no se toca']); return; }

      d.h.epi.getRange(ep.fila, 3).setNumberFormat('dd/MM/yyyy').setValue(hcDeISO_(alta));
      ep.alta = alta;
      cuenta.episodios++;
      const id = d.pacienteDeHC[idHC] || '';
      registroAnotar_('propietario', 'administrador', 'aplicarEpisodiosOlvidados', id || idHC,
        JSON.stringify({ campo: 'Alta del episodio', idHC: idHC, inicio: inicio, despues: alta }), 'ok');
      let resultado = 'Episodio cerrado el ' + epiOlvFechaTexto_(alta);

      const posterior = d.episodios.some(function (o) { return o !== ep && o.idHC === idHC && (!o.ingreso || o.ingreso > inicio); });
      const u = id ? d.usuarios[id] : null;
      if (aplicar === 'Sí' && !posterior && u && u.estado !== ESTADOS_PACIENTE.ALTA) {
        const fila = d.filaDe[id];
        d.maestra.getRange(fila, d.col.estado + 1).setValue(ESTADOS_PACIENTE.ALTA);
        d.maestra.getRange(fila, d.col.tipo + 1).setValue('');
        if (d.col.ultima !== -1) d.maestra.getRange(fila, d.col.ultima + 1).setValue(hcDeISO_(alta));
        historialRegistrar_([
          { id: id, campo: COLUMNAS.MAESTRA.ESTADO, antes: u.estadoCelda, despues: ESTADOS_PACIENTE.ALTA },
          { id: id, campo: COLUMNAS.MAESTRA.TIPO_INGRESO, antes: u.tipo, despues: '' }
        ], 'Alta (cierre de episodios olvidados)');
        registroAnotar_('propietario', 'administrador', 'aplicarEpisodiosOlvidados', id,
          JSON.stringify({ campo: COLUMNAS.MAESTRA.ESTADO, antes: u.estado, despues: ESTADOS_PACIENTE.ALTA }), 'ok');
        u.estado = ESTADOS_PACIENTE.ALTA;
        cuenta.altas++;
        resultado += ' · usuario pasado a Alta';
      }
      resultados.push([resultado]);
    });
  });
  rev.getRange(2, EPI_OLV_COL_.RESULTADO + 1, resultados.length, 1).setValues(resultados);
  if (cuenta.altas) { try { ordenarPacientes_(); } catch (e) { Logger.log('Reordenar: ' + e.message); } }
  Logger.log('Episodios cerrados: ' + cuenta.episodios + '. Usuarios pasados a Alta: ' + cuenta.altas +
    '. Sin cambiar (mira la columna «Resultado»): ' + cuenta.saltados + '.');
}
