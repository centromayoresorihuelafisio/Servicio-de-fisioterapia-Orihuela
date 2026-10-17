/**
 * MIGRACIÓN DE HISTORIAS CLÍNICAS: DE GOOGLE DOCS A HOJAS (prueba y completa)
 *
 * Copia el contenido de cada HC (Historia, Tratamiento y los ingresos/altas de
 * la tabla ASISTENCIA) a hojas nuevas de la propia hoja de cálculo. Los datos
 * personales NO se copian: se seguirán leyendo de la Maestra.
 *
 * QUÉ NO HACE (garantías):
 *   - No modifica, mueve ni borra ningún Doc.
 *   - No modifica la Base de Datos Maestra (la columna "Historia clínica" sigue
 *     enlazando a los Docs). El cambio de enlaces será un paso posterior y aparte.
 *   - No cambia ninguna otra función de la app: nada lee todavía estas hojas.
 *   Lo único que escribe son tres hojas nuevas: "Historias Clínicas",
 *   "Episodios HC" y "Log Migración HC".
 *
 * Verificación: tras escribir cada lote, vuelve a LEER lo escrito en la hoja y
 * lo compara con lo extraído del Doc (texto, enlace al Doc y fechas). Todo queda
 * en "Log Migración HC" con el resultado (OK / Revisar / No migrada / Error) y los
 * recuentos de caracteres y de episodios de cada lado.
 *
 * Cómo usarlo (desde el editor de Apps Script):
 *   1. `migrarHCPrueba`: migra una muestra de ~10 Docs elegidos a propósito (con
 *      formato, con varios ingresos, con alta, vacíos, el más largo…). Usa la hoja
 *      "Diagnóstico HC" si existe. Compara a ojo cada uno con su Doc original.
 *   2. `migrarHCCompleta`: migra el resto. Es reanudable: se detiene a los ~4,5
 *      min; si dice "Quedan N", vuelve a ejecutarla. Los Docs ya migrados se
 *      saltan (se reconocen por el enlace guardado en la hoja), así que nunca se
 *      duplican.
 *   Para reintentar un Doc marcado "No migrada", borra su fila del log.
 *   `reiniciarMigracionHC` borra las tres hojas (pide escribir BORRAR).
 *
 * Depende de herramientas/Diagnostico_HC.gs (diagHC_listarHistorias_, diagHC_analizarDoc_,
 * DIAG_HC_ y DIAG_HC_CABECERAS_), que ya tienes: sirve la versión que ejecutaste.
 * Todos los nombres propios llevan el prefijo migHC_ / MIG_HC_.
 */

const MIG_HC_ = {
  HOJA_HC: 'Historias Clínicas',
  HOJA_EPI: 'Episodios HC',
  HOJA_LOG: 'Log Migración HC',
  MARGEN_MS: 4.5 * 60 * 1000,
  LOTE: 10,
  TAM_PRUEBA: 10
};
const MIG_HC_CAB_HC_ = ['ID HC', 'Nombre (referencia)', 'Historia', 'Tratamiento', 'Modificado (Doc)', 'Origen', 'Doc original'];
const MIG_HC_CAB_EPI_ = ['ID HC', 'Ingreso', 'Alta', 'Nota'];
const MIG_HC_CAB_LOG_ = ['Fecha', 'Fila Maestra', 'Nombre', 'ID HC', 'Resultado', 'Detalle',
  'Caracteres Historia (Doc)', 'Caracteres Historia (hoja)', 'Caracteres Tratamiento (Doc)',
  'Caracteres Tratamiento (hoja)', 'Episodios (Doc)', 'Episodios (hoja)', 'Enlace Doc'];

function migrarHCPrueba() { migHC_ejecutar_(true); }
function migrarHCCompleta() { migHC_ejecutar_(false); }

/** Borra las tres hojas de migración. Pide escribir BORRAR. */
function reiniciarMigracionHC() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Reiniciar migración de HC',
    'Se borrarán las hojas "' + MIG_HC_.HOJA_HC + '", "' + MIG_HC_.HOJA_EPI + '" y "' + MIG_HC_.HOJA_LOG +
    '". Los Docs y la Maestra no se tocan.\n\nEscribe BORRAR para confirmar:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK || resp.getResponseText().trim() !== 'BORRAR') return;
  const ss = getSS();
  [MIG_HC_.HOJA_HC, MIG_HC_.HOJA_EPI, MIG_HC_.HOJA_LOG].forEach(function (n) {
    const h = ss.getSheetByName(n);
    if (h) ss.deleteSheet(h);
  });
  ss.toast('Hojas de migración borradas.', 'Migración HC', 8);
}

/* ---------------------------------------------------------------------- */

function migHC_ejecutar_(prueba) {
  const inicio = Date.now();
  const ss = getSS();
  const items = diagHC_listarHistorias_(ss);
  if (!items.length) { ss.toast('No hay historias clínicas enlazadas en la Maestra.', 'Migración HC', 8); return; }

  const hojas = migHC_prepararHojas_(ss);
  const tratados = migHC_docIdsTratados_(hojas);

  let pendientes = items.filter(function (it) { return it.docId && !tratados[it.docId]; });
  if (prueba) {
    const muestra = migHC_elegirMuestra_(ss, items);
    pendientes = pendientes.filter(function (it) { return muestra.indexOf(it.fila) !== -1; });
  }

  let lote = [], hechos = 0;
  for (let k = 0; k < pendientes.length; k++) {
    if (Date.now() - inicio > MIG_HC_.MARGEN_MS) break;
    lote.push(migHC_procesarItem_(pendientes[k]));
    hechos++;
    if (lote.length >= MIG_HC_.LOTE) { migHC_volcar_(hojas, lote); lote = []; }
  }
  migHC_volcar_(hojas, lote);

  const quedan = pendientes.length - hechos;
  let msg;
  if (prueba) {
    msg = hechos ? 'Prueba terminada: ' + hechos + ' Docs copiados. Revisa "' + MIG_HC_.HOJA_LOG + '" y compáralos con sus Docs.'
                 : 'La muestra de prueba ya estaba migrada.';
  } else {
    msg = quedan > 0 ? 'Migrados ' + hechos + ' en esta pasada. Quedan ' + quedan + ': vuelve a ejecutar migrarHCCompleta.'
                     : 'Migración terminada (' + hechos + ' en esta pasada). Revisa "' + MIG_HC_.HOJA_LOG + '".';
  }
  ss.toast(msg, 'Migración HC', 20);
}

/** Crea las hojas si no existen (solo cabeceras; los formatos se fijan al escribir). */
function migHC_prepararHojas_(ss) {
  const hacer = function (nombre, cab) {
    let h = ss.getSheetByName(nombre);
    if (!h) {
      h = ss.insertSheet(nombre);
      h.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
      h.setFrozenRows(1);
    }
    return h;
  };
  return {
    hc: hacer(MIG_HC_.HOJA_HC, MIG_HC_CAB_HC_),
    epi: hacer(MIG_HC_.HOJA_EPI, MIG_HC_CAB_EPI_),
    log: hacer(MIG_HC_.HOJA_LOG, MIG_HC_CAB_LOG_),
    tz: ss.getSpreadsheetTimeZone()
  };
}

/** IDs de Doc ya migrados (en la hoja HC) o marcados "No migrada" (en el log). */
function migHC_docIdsTratados_(hojas) {
  const out = {};
  const id = function (txt) { const m = String(txt).match(/[-\w]{25,}/); return m ? m[0] : ''; };
  if (hojas.hc.getLastRow() > 1) {
    hojas.hc.getRange(2, 7, hojas.hc.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const d = id(r[0]); if (d) out[d] = true;
    });
  }
  if (hojas.log.getLastRow() > 1) {
    hojas.log.getRange(2, 1, hojas.log.getLastRow() - 1, MIG_HC_CAB_LOG_.length).getValues().forEach(function (r) {
      if (r[4] === 'No migrada') { const d = id(r[12]); if (d) out[d] = true; }
    });
  }
  return out;
}

/**
 * Elige ~10 filas de la Maestra con casuísticas variadas, apoyándose en la hoja
 * "Diagnóstico HC". Sin esa hoja, toma las 10 primeras.
 */
function migHC_elegirMuestra_(ss, items) {
  const validas = {};
  items.forEach(function (it) { validas[it.fila] = true; });
  const elegidas = [];
  const anadir = function (f) {
    if (f && validas[f] && elegidas.indexOf(f) === -1 && elegidas.length < MIG_HC_.TAM_PRUEBA) elegidas.push(f);
  };

  const hoja = ss.getSheetByName(DIAG_HC_.HOJA);
  if (hoja && hoja.getLastRow() > 1) {
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, DIAG_HC_CABECERAS_.length).getValues();
    const ci = function (n) { return DIAG_HC_CABECERAS_.indexOf(n); };
    const num = function (v) { return typeof v === 'number' ? v : (parseInt(v, 10) || 0); };
    const tomar = function (filtro, orden, n) {
      datos.filter(filtro).sort(orden).slice(0, n).forEach(function (f) { anadir(f[0]); });
    };
    tomar(function (f) { return String(f[ci('Formato en Historia/Tratamiento')]).trim() !== ''; }, function () { return 0; }, 2);
    tomar(function (f) { return num(f[ci('Ingresos rellenos')]) > 1; },
      function (a, b) { return num(b[ci('Ingresos rellenos')]) - num(a[ci('Ingresos rellenos')]); }, 2);
    tomar(function (f) { return num(f[ci('Altas rellenas')]) > 0; }, function () { return 0; }, 2);
    tomar(function (f) { return num(f[ci('Caracteres Historia')]) === 0 && num(f[ci('Caracteres Tratamiento')]) === 0; }, function () { return 0; }, 1);
    tomar(function () { return true; }, function (a, b) { return num(b[ci('Caracteres Historia')]) - num(a[ci('Caracteres Historia')]); }, 1);
    tomar(function () { return true; }, function (a, b) { return num(b[ci('Caracteres Tratamiento')]) - num(a[ci('Caracteres Tratamiento')]); }, 1);
    tomar(function (f) { return f[ci('Resultado')] !== 'OK'; }, function () { return 0; }, 2);
  }
  items.forEach(function (it) { anadir(it.fila); });   // completa hasta TAM_PRUEBA
  return elegidas;
}

/* ---------------------------------------------------------------------- */

/** Abre el Doc, extrae y devuelve una entrada de lote. Nunca lanza error. */
function migHC_procesarItem_(it) {
  try {
    const doc = DocumentApp.openById(it.docId);
    const diag = diagHC_analizarDoc_(doc, it);
    const loc = migHC_localizarTablas_(doc.getBody().getTables());
    if (!loc.hist) {
      return { it: it, resultado: 'No migrada', detalle: 'Sin tabla historia/tratamiento. ' + diag.obs.join(' · ') };
    }
    const ext = migHC_extraerDoc_(loc);
    const id = Utilities.getUuid();
    let modificado = '';
    try { modificado = DriveApp.getFileById(it.docId).getLastUpdated(); } catch (e) { /* no crítico */ }

    const avisos = diag.obs.concat(ext.avisos);
    if (diag.formato) avisos.push('tenía formato (' + diag.formato + '): se copia como texto plano');
    return {
      it: it, id: id, resultado: avisos.length ? 'Revisar' : 'OK', detalle: avisos.join(' · '),
      hc: [id, it.nombre, ext.historia, ext.tratamiento, modificado, 'Migrada de Doc', it.url],
      epi: ext.episodios.map(function (e) { return [id, e.ingreso, e.alta, e.nota]; }),
      charsHist: migHC_largo_(ext.historia), charsTrat: migHC_largo_(ext.tratamiento), nEpi: ext.episodios.length
    };
  } catch (e) {
    return { it: it, resultado: 'Error', detalle: 'No se pudo migrar: ' + e.message };
  }
}

/**
 * Localiza las tres tablas de la plantilla (asistencia, datos personales,
 * historia/tratamiento). Misma regla que usa el diagnóstico; se repite aquí para
 * que este archivo no dependa de una versión concreta de Diagnostico_HC.gs.
 */
function migHC_localizarTablas_(tablas) {
  let asist = null, datos = null, hist = null;
  tablas.forEach(function (t) {
    let primera = '', texto = '', fila0 = '';
    try { primera = normalizarTexto(t.getCell(0, 0).getText()); } catch (e) { /* tabla vacía */ }
    try { texto = normalizarTexto(t.getText()); } catch (e) { /* ignorar */ }
    try { fila0 = normalizarTexto(t.getRow(0).getText()); } catch (e) { /* ignorar */ }
    if (!hist && fila0.indexOf('historia') !== -1 && fila0.indexOf('tratamiento') !== -1) hist = t;
    else if (!datos && texto.indexOf('nombre') !== -1 && (texto.indexOf('dni') !== -1 || texto.indexOf('telefono') !== -1)) datos = t;
    else if (!asist && (primera.indexOf('asistencia') !== -1 || primera.indexOf('ingreso') !== -1 || texto.indexOf('ingreso') !== -1)) asist = t;
  });
  return { asist: asist, datos: datos, hist: hist };
}

/** Extrae Historia, Tratamiento y episodios de las tablas ya localizadas. Lógica pura. */
function migHC_extraerDoc_(loc) {
  const avisos = [];
  const limpiar = function (t) {
    return String(t).replace(/\r/g, '').replace(/ /g, ' ').replace(/[ \t]+$/gm, '').trim();
  };

  // --- historia / tratamiento: filas de contenido (todas menos la cabecera) ---
  const h = [], t = [];
  for (let i = 1; i < loc.hist.getNumRows(); i++) {
    const fila = loc.hist.getRow(i);
    if (fila.getNumCells() > 0) h.push(fila.getCell(0).getText());
    if (fila.getNumCells() > 1) t.push(fila.getCell(1).getText());
  }

  // --- episodios: una fila por ingreso/alta ---
  const episodios = [];
  if (loc.asist) {
    for (let i = 0; i < loc.asist.getNumRows(); i++) {
      const fila = loc.asist.getRow(i);
      const n = fila.getNumCells();
      const c0 = n > 0 ? fila.getCell(0).getText().trim() : '';
      let c1 = n > 1 ? fila.getCell(1).getText().trim() : '';
      const u0 = normalizarTexto(c0), u1 = normalizarTexto(c1);
      if (u0 === 'asistencia' || u0 === 'ingreso' || u1 === 'alta') continue;   // cabeceras
      if (u1 === 'fecha') c1 = '';                                              // marcador de plantilla
      if (!c0 && !c1) continue;

      const ing = migHC_parseFecha_(c0), alt = migHC_parseFecha_(c1);
      const notas = [];
      if (c0 && !ing) notas.push('Ingreso no reconocido: "' + c0 + '"');
      if (c1 && !alt) notas.push('Alta no reconocida: "' + c1 + '"');
      if (!c0 && c1) notas.push('Alta sin fecha de ingreso');
      if (ing && alt && alt.getTime() < ing.getTime()) notas.push('Alta anterior al ingreso');
      if (notas.length) avisos.push('episodio ' + (episodios.length + 1) + ': ' + notas.join(', '));
      episodios.push({ ingreso: ing || '', alta: alt || '', nota: notas.join(' · ') });
    }
  }
  return { historia: limpiar(h.join('\n')), tratamiento: limpiar(t.join('\n')), episodios: episodios, avisos: avisos };
}

/** dd/mm/aaaa (también d/m/aa, con / - o .). Devuelve Date a las 12:00 o null. */
function migHC_parseFecha_(txt) {
  const m = String(txt || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  const y = m[3].length === 2 ? 2000 + (+m[3]) : +m[3];
  const f = new Date(y, mo - 1, d, 12, 0, 0);
  if (f.getFullYear() !== y || f.getMonth() !== mo - 1 || f.getDate() !== d) return null;
  return f;
}

function migHC_largo_(s) { return String(s).replace(/\s+/g, ' ').trim().length; }

/* ---------------------------------------------------------------------- */

/**
 * Escribe un lote en las hojas, lo VUELVE A LEER, compara con lo esperado y
 * añade las filas del log. Texto siempre como texto plano ('@') para que Sheets
 * no convierta en fórmula o fecha un texto que empiece por "=", "+", "-" o una fecha.
 */
function migHC_volcar_(hojas, lote) {
  if (!lote.length) return;
  const ok = lote.filter(function (e) { return e.hc; });
  const epiFilas = [];
  ok.forEach(function (e) { e.epi.forEach(function (r) { epiFilas.push(r); }); });

  let filaHC = 0, filaEpi = 0;
  if (ok.length) {
    filaHC = Math.max(hojas.hc.getLastRow(), 1) + 1;
    migHC_asegurarFilas_(hojas.hc, filaHC + ok.length - 1);
    const rg = hojas.hc.getRange(filaHC, 1, ok.length, MIG_HC_CAB_HC_.length);
    rg.setNumberFormat('@');
    hojas.hc.getRange(filaHC, 5, ok.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    rg.setValues(ok.map(function (e) { return e.hc; }));
  }
  if (epiFilas.length) {
    filaEpi = Math.max(hojas.epi.getLastRow(), 1) + 1;
    migHC_asegurarFilas_(hojas.epi, filaEpi + epiFilas.length - 1);
    const rg = hojas.epi.getRange(filaEpi, 1, epiFilas.length, MIG_HC_CAB_EPI_.length);
    rg.setNumberFormat('@');
    hojas.epi.getRange(filaEpi, 2, epiFilas.length, 2).setNumberFormat('dd/MM/yyyy');
    rg.setValues(epiFilas);
  }
  SpreadsheetApp.flush();

  // --- lectura posterior y comparación ---
  const leidasHC = ok.length ? hojas.hc.getRange(filaHC, 1, ok.length, MIG_HC_CAB_HC_.length).getValues() : [];
  const leidasEpi = epiFilas.length ? hojas.epi.getRange(filaEpi, 1, epiFilas.length, MIG_HC_CAB_EPI_.length).getValues() : [];
  const dia = function (v) { return v instanceof Date ? Utilities.formatDate(v, hojas.tz, 'yyyy-MM-dd') : String(v); };

  let ptr = 0;
  const logFilas = lote.map(function (e) {
    let res = e.resultado, det = e.detalle || '';
    let chH = '', chT = '', nEpiHoja = '';
    if (e.hc) {
      const l = leidasHC[ok.indexOf(e)];
      const textoOk = l[0] === e.hc[0] && l[2] === e.hc[2] && l[3] === e.hc[3] && l[6] === e.hc[6];
      chH = migHC_largo_(l[2]); chT = migHC_largo_(l[3]);
      let coinciden = 0;
      e.epi.forEach(function (esp, k) {
        const got = leidasEpi[ptr + k];
        if (got && got[0] === esp[0] && dia(got[1]) === dia(esp[1]) && dia(got[2]) === dia(esp[2])) coinciden++;
      });
      ptr += e.epi.length;
      nEpiHoja = coinciden;
      if (!textoOk || coinciden !== e.epi.length) {
        res = 'Error de escritura';
        det = (det ? det + ' · ' : '') + 'lo leído de la hoja no coincide con lo extraído del Doc';
      }
    }
    return [new Date(), e.it.fila, e.it.nombre, e.id || '', res, det,
      e.charsHist !== undefined ? e.charsHist : '', chH, e.charsTrat !== undefined ? e.charsTrat : '', chT,
      e.nEpi !== undefined ? e.nEpi : '', nEpiHoja, e.it.url];
  });

  const filaLog = Math.max(hojas.log.getLastRow(), 1) + 1;
  migHC_asegurarFilas_(hojas.log, filaLog + logFilas.length - 1);
  hojas.log.getRange(filaLog, 1, logFilas.length, MIG_HC_CAB_LOG_.length).setValues(logFilas);
}

/** Añade filas a la hoja si hace falta (setValues falla fuera de las dimensiones). */
function migHC_asegurarFilas_(hoja, hastaFila) {
  const max = hoja.getMaxRows();
  if (hastaFila > max) hoja.insertRowsAfter(max, hastaFila - max);
}