// =====================================================================================
// herramientas/Quitar_Emojis.gs
// MIGRACIÓN ÚNICA (27-oct-2026): quita los emojis de Estado, Gravedad y Tipo de Ingreso en las celdas de la hoja.
//
// Antes los valores guardados eran "🟢 Activo", "🟠 Moderado", "📄 Volante"…; ahora son "Activo", "Moderado", "Volante"
// (core/Config.gs: ESTADOS_PACIENTE, GRAVEDAD_PACIENTE, TIPOS_INGRESO). El código nuevo funciona con las dos formas
// (textoSinEmoji_), así que el orden de despliegue no importa; esta migración deja la hoja limpia.
//
// Desde el editor de Apps Script, tras `clasp push` y la nueva versión:
//   1. `revisarEmojis`: SOLO LECTURA. Cuenta los valores distintos de cada columna, a qué se convertirían y cuáles no se
//      reconocen (esos se dejan tal cual). Avisa si las columnas tienen una lista desplegable (validación de datos) con
//      los valores antiguos.
//   2. `quitarEmojis`: escribe. Toca SOLO las columnas Estado, Gravedad y Tipo de Ingreso de la Maestra y los campos
//      "Valor anterior" / "Valor nuevo" de «Historial Estado» (solo las filas de esos tres campos). No reescribe filas
//      enteras (no toca hipervínculos, prioridad ni ninguna otra columna). Se puede repetir: lo ya limpio no cambia.
//
// Reutiliza SIN modificar: getSS (core/WebApp.gs), SHEETS, COLUMNAS, ESTADOS_PACIENTE, GRAVEDAD_PACIENTE, TIPOS_INGRESO
// (core/Config.gs), textoSinEmoji_ (core/Utils.gs). Nombres con prefijo emoji / EMOJI_ para no chocar en el ámbito global.
// =====================================================================================

/** Columnas de la Maestra afectadas y los valores válidos (sin emoji) de cada una. */
function emojiColumnas_() {
  return [
    { campo: COLUMNAS.MAESTRA.ESTADO, validos: Object.keys(ESTADOS_PACIENTE).filter(k => typeof ESTADOS_PACIENTE[k] === 'string').map(k => ESTADOS_PACIENTE[k]) },
    { campo: COLUMNAS.MAESTRA.GRAVEDAD, validos: GRAVEDAD_PACIENTE.LISTA.slice() },
    { campo: COLUMNAS.MAESTRA.TIPO_INGRESO, validos: TIPOS_INGRESO.LISTA.slice() }
  ];
}

function emojiClave_(v) { return textoSinEmoji_(v).toLowerCase(); }

/**
 * PARTE PURA (no toca hojas). Convierte una lista de valores a su forma sin emoji.
 * @param {Array} valores valores de celda (cualquier tipo)
 * @param {string[]} validos valores correctos sin emoji de esa columna
 * @return {{nuevos: string[], cambios: Object<string,{a:string,n:number}>, desconocidos: Object<string,number>, filasCambiadas: number}}
 *   `nuevos` = el valor ya convertido de cada entrada (igual que el original si no hay que cambiarlo).
 */
function emojiConvertir_(valores, validos) {
  const porClave = {};
  validos.forEach(v => { porClave[emojiClave_(v)] = v; });
  const out = { nuevos: [], cambios: {}, desconocidos: {}, filasCambiadas: 0 };
  valores.forEach(v => {
    const crudo = (v === null || v === undefined) ? '' : v;
    const txt = String(crudo).trim();
    if (!txt) { out.nuevos.push(crudo); return; }
    const canonico = porClave[emojiClave_(txt)];
    if (!canonico) {
      out.desconocidos[txt] = (out.desconocidos[txt] || 0) + 1;
      out.nuevos.push(crudo);
      return;
    }
    if (String(crudo) === canonico) { out.nuevos.push(crudo); return; }
    out.nuevos.push(canonico);
    const k = String(crudo);
    if (!out.cambios[k]) out.cambios[k] = { a: canonico, n: 0 };
    out.cambios[k].n++;
    out.filasCambiadas++;
  });
  return out;
}

/** Lee la Maestra y devuelve, por columna afectada, su posición (1 = columna A) y el análisis de sus valores. */
function emojiAnalizarMaestra_(maestra) {
  const lastRow = maestra.getLastRow(), lastCol = maestra.getLastColumn();
  const headers = maestra.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  return emojiColumnas_().map(col => {
    const idx = headers.indexOf(col.campo);
    if (idx === -1) return { campo: col.campo, columna: 0, filas: 0, analisis: null };
    const filas = Math.max(lastRow - 1, 0);
    const valores = filas ? maestra.getRange(2, idx + 1, filas, 1).getValues().map(r => r[0]) : [];
    let validaciones = 0;
    if (filas) {
      maestra.getRange(2, idx + 1, filas, 1).getDataValidations().forEach(r => { if (r[0]) validaciones++; });
    }
    return { campo: col.campo, columna: idx + 1, filas: filas, valores: valores, validaciones: validaciones, analisis: emojiConvertir_(valores, col.validos) };
  });
}

/** Informe de una columna en el registro. */
function emojiLogColumna_(r) {
  if (!r.columna) { Logger.log('· ' + r.campo + ': NO se encuentra la columna en la Maestra.'); return; }
  const a = r.analisis;
  Logger.log('· ' + r.campo + ' (columna ' + r.columna + ', ' + r.filas + ' filas): ' + a.filasCambiadas + ' celda(s) a cambiar.');
  Object.keys(a.cambios).forEach(k => Logger.log('     "' + k + '" → "' + a.cambios[k].a + '"  (' + a.cambios[k].n + ')'));
  Object.keys(a.desconocidos).forEach(k => Logger.log('     NO RECONOCIDO, se deja igual: "' + k + '"  (' + a.desconocidos[k] + ')'));
  if (r.validaciones) Logger.log('     AVISO: ' + r.validaciones + ' celda(s) tienen lista desplegable (validación de datos); si esa lista aún tiene los valores con emoji, actualízala o quítala a mano en Sheets.');
}

/** Analiza «Historial Estado»: filas de los tres campos y cuántos valores (anterior/nuevo) llevan emoji. */
function emojiAnalizarHistorial_(hoja) {
  if (!hoja || hoja.getLastRow() < 2) return null;
  const n = hoja.getLastRow() - 1;
  const datos = hoja.getRange(2, 1, n, 6).getValues();   // ID | Fecha | Campo | Anterior | Nuevo | Origen
  const porCampo = {};
  emojiColumnas_().forEach(c => { porCampo[c.campo] = c.validos; });
  const anteriores = datos.map(r => r[3]), nuevos = datos.map(r => r[4]);
  const nuevoAnt = anteriores.slice(), nuevoNue = nuevos.slice();
  let cambiosAnt = 0, cambiosNue = 0;
  const desconocidos = {};
  datos.forEach((r, i) => {
    const validos = porCampo[String(r[2]).trim()];
    if (!validos) return;
    const a = emojiConvertir_([r[3]], validos), b = emojiConvertir_([r[4]], validos);
    if (a.filasCambiadas) { nuevoAnt[i] = a.nuevos[0]; cambiosAnt++; }
    if (b.filasCambiadas) { nuevoNue[i] = b.nuevos[0]; cambiosNue++; }
    [a, b].forEach(x => Object.keys(x.desconocidos).forEach(k => { desconocidos[r[2] + ': ' + k] = (desconocidos[r[2] + ': ' + k] || 0) + 1; }));
  });
  return { filas: n, nuevoAnt: nuevoAnt, nuevoNue: nuevoNue, cambiosAnt: cambiosAnt, cambiosNue: cambiosNue, desconocidos: desconocidos };
}

/** SOLO LECTURA: qué cambiaría `quitarEmojis`. Mira el registro de ejecuciones. */
function revisarEmojis() {
  const ss = getSS();
  const maestra = ss.getSheetByName(SHEETS.MAESTRA);
  if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
  Logger.log('=== Revisión de emojis (solo lectura; no se ha cambiado nada) ===');
  Logger.log('Maestra:');
  emojiAnalizarMaestra_(maestra).forEach(emojiLogColumna_);
  const h = emojiAnalizarHistorial_(ss.getSheetByName(SHEETS.HISTORIAL));
  if (!h) { Logger.log('Historial Estado: sin filas.'); return; }
  Logger.log('Historial Estado (' + h.filas + ' filas): ' + h.cambiosAnt + ' "Valor anterior" y ' + h.cambiosNue + ' "Valor nuevo" a cambiar.');
  Object.keys(h.desconocidos).forEach(k => Logger.log('     NO RECONOCIDO, se deja igual: "' + k + '"  (' + h.desconocidos[k] + ')'));
}

/** ESCRIBE: quita los emojis (ver cabecera). Se puede repetir sin problema. */
function quitarEmojis() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSS();
    const maestra = ss.getSheetByName(SHEETS.MAESTRA);
    if (!maestra) throw new Error('No se encontró la hoja "' + SHEETS.MAESTRA + '".');
    Logger.log('=== Quitar emojis ===');
    let total = 0;
    emojiAnalizarMaestra_(maestra).forEach(r => {
      emojiLogColumna_(r);
      if (!r.columna || !r.analisis.filasCambiadas) return;
      // Solo esa columna, con los valores ya convertidos (el resto de la fila no se toca).
      maestra.getRange(2, r.columna, r.filas, 1).setValues(r.analisis.nuevos.map(v => [v]));
      total += r.analisis.filasCambiadas;
    });
    const hoja = ss.getSheetByName(SHEETS.HISTORIAL);
    const h = emojiAnalizarHistorial_(hoja);
    if (h && (h.cambiosAnt || h.cambiosNue)) {
      hoja.getRange(2, 4, h.filas, 1).setValues(h.nuevoAnt.map(v => [v]));
      hoja.getRange(2, 5, h.filas, 1).setValues(h.nuevoNue.map(v => [v]));
      total += h.cambiosAnt + h.cambiosNue;
    }
    SpreadsheetApp.flush();
    Logger.log('Hecho: ' + total + ' valor(es) cambiado(s)' + (h ? ' (Historial Estado: ' + h.cambiosAnt + ' anteriores y ' + h.cambiosNue + ' nuevos)' : '') + '.');
    Logger.log('Siguiente paso: ejecuta `revisarEmojis` y comprueba que ya no queda nada por cambiar.');
  } finally {
    try { lock.releaseLock(); } catch (e) { /* sin bloqueo que liberar */ }
  }
}
