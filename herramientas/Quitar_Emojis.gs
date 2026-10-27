// =====================================================================================
// herramientas/Quitar_Emojis.gs
// MIGRACIÓN ÚNICA (27-oct-2026): deja la hoja de cálculo SIN emojis.
//
// Antes los valores guardados eran "🟢 Activo", "🟠 Moderado", "📄 Volante"…; ahora son "Activo", "Moderado", "Volante"
// (core/Config.gs: ESTADOS_PACIENTE, GRAVEDAD_PACIENTE, TIPOS_INGRESO). El código nuevo funciona con las dos formas
// (textoSinEmoji_), pero el dueño quiere la hoja limpia para evitar errores de comparación.
//
// Qué limpia `quitarEmojis`, por este orden:
//   1. ETIQUETAS de valores cerrados, convertidas a su texto oficial: Maestra (Estado, Gravedad, Tipo de Ingreso), «Citas»
//      (Asistencia), «Recordatorios» (Tipo, columna 4), «Valoraciones» (Tipo, columna 2) y «Historial Estado» (Valor anterior /
//      Valor nuevo, solo las filas de Estado, Gravedad y Tipo de Ingreso). Un valor que no se reconoce NO se inventa: se deja
//      como estaba (salvo el emoji, ver punto 3) y sale en el informe.
//   2. LISTAS DESPLEGABLES (validación de datos) de cualquier hoja: se reconstruyen sin emoji (mismo resto de opciones).
//   3. TEXTO LIBRE (solo si EMOJI_INCLUIR_TEXTO_LIBRE_ es true): quita el emoji de cualquier otra celda de texto de cualquier
//      hoja (nombres, notas, historia, tratamiento, cabeceras…). Solo toca las celdas que lo llevan, una a una (no reescribe
//      columnas enteras, así que no se pierden hipervínculos ni formato). No toca fórmulas.
//   NO se toca: la hoja «Agenda AAAA-AAAA» (archivo congelado; solo se informa), los emojis que viven en las notas de celda,
//   en las reglas de formato condicional ni en los nombres de las pestañas (solo se avisa para que los revises a mano).
//
// Desde el editor de Apps Script, tras `clasp push` y la nueva versión:
//   1. `revisarEmojis`: SOLO LECTURA. Informa de todo lo anterior sin cambiar nada.
//   2. `quitarEmojis`: escribe. Se puede repetir: lo ya limpio no cambia. Si Apps Script corta por tiempo, vuelve a ejecutarla.
//   3. `revisarEmojis` otra vez: debe salir todo a 0 (salvo los avisos de la hoja congelada, notas y formatos).
//
// Reutiliza SIN modificar: getSS (core/WebApp.gs), SHEETS, COLUMNAS, COLUMNAS_NUM, ASISTENCIA_CITA, ESTADOS_PACIENTE,
// GRAVEDAD_PACIENTE, TIPOS_INGRESO (core/Config.gs), RECORDATORIO_TIPOS_ (agenda/Recordatorios.gs), textoSinEmoji_ (core/Utils.gs).
// Nombres con prefijo emoji / EMOJI_ para no chocar en el ámbito global.
// =====================================================================================

/** Hojas que NO se modifican (solo se informa de ellas): el archivo congelado «Agenda AAAA-AAAA» (CONTEXTO.md, sección 4). */
const EMOJI_HOJAS_SIN_TOCAR_ = /^Agenda \d{4}-\d{4}$/;

/** true = además de las etiquetas y listas, quita el emoji de CUALQUIER otra celda de texto. false = solo etiquetas y listas. */
const EMOJI_INCLUIR_TEXTO_LIBRE_ = true;

/** Símbolos tipográficos que NO cuentan como emoji y se conservan (los permite CONTEXTO.md, sección 6). */
const EMOJI_MANTENER_ = '©®™↔↕✓✕★☆';

/** Tiempo máximo de una ejecución de `quitarEmojis` antes de parar limpiamente (Apps Script corta a los 6 min). */
const EMOJI_TIEMPO_MAX_MS_ = 270000;

// ------------------------------------- PARTE PURA (no toca hojas) -------------------------------------

/** Expresión que reconoce emojis (pictogramas, banderas, tonos de piel, teclas, unión ZWJ y selector de emoji). */
let emojiRegexCache_ = null;
function emojiRegex_() {
  if (!emojiRegexCache_) emojiRegexCache_ = emojiRegexNueva_();
  emojiRegexCache_.lastIndex = 0;
  return emojiRegexCache_;
}
function emojiRegexNueva_() {
  try {
    return new RegExp('[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u{1F3FB}-\\u{1F3FF}\\u20E3\\uFE0F\\u200D]', 'gu');
  } catch (e) {
    // Motor sin propiedades Unicode: rangos aproximados (lo permitido en EMOJI_MANTENER_ se conserva igualmente).
    return new RegExp('[\\u{1F000}-\\u{1FAFF}\\u2300-\\u23FF\\u2600-\\u27BF\\u2B00-\\u2BFF\\u20E3\\uFE0F\\u200D]', 'gu');
  }
}

/** ¿El valor es un texto con algún emoji (sin contar los símbolos de EMOJI_MANTENER_)? */
function emojiTiene_(v) {
  if (typeof v !== 'string' || !v) return false;
  const re = emojiRegex_();
  let m;
  while ((m = re.exec(v)) !== null) {
    if (EMOJI_MANTENER_.indexOf(m[0]) === -1) return true;
  }
  return false;
}

/** Quita los emojis de un texto. Si no había ninguno devuelve el texto IDÉNTICO; si los había, recorta y junta espacios dobles. */
function emojiQuitar_(v) {
  const s = String(v === null || v === undefined ? '' : v);
  const limpio = s.replace(emojiRegex_(), c => (EMOJI_MANTENER_.indexOf(c) === -1 ? '' : c));
  if (limpio === s) return s;
  return limpio.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Columnas de la Maestra afectadas y los valores válidos (sin emoji) de cada una. */
function emojiColumnas_() {
  return [
    { campo: COLUMNAS.MAESTRA.ESTADO, validos: Object.keys(ESTADOS_PACIENTE).filter(k => typeof ESTADOS_PACIENTE[k] === 'string').map(k => ESTADOS_PACIENTE[k]) },
    { campo: COLUMNAS.MAESTRA.GRAVEDAD, validos: GRAVEDAD_PACIENTE.LISTA.slice() },
    { campo: COLUMNAS.MAESTRA.TIPO_INGRESO, validos: TIPOS_INGRESO.LISTA.slice() }
  ];
}

/**
 * Columnas de etiquetas (valores cerrados) de TODAS las hojas. Cada columna se identifica por `campo` (texto de la cabecera de la
 * fila 1) o por `columna` (posición, 1 = A); los datos empiezan en la fila 2.
 */
function emojiEtiquetas_() {
  const A = ASISTENCIA_CITA;
  return [
    { hoja: SHEETS.MAESTRA, columnas: emojiColumnas_() },
    { hoja: SHEETS.CITAS, columnas: [{ campo: COLUMNAS.CITAS.ASISTENCIA, validos: [A.PENDIENTE, A.ASISTIDO, A.NO_ASISTIDO, A.JUSTIFICADA] }] },
    { hoja: SHEETS.RECORDATORIOS, columnas: [{ columna: 4, validos: RECORDATORIO_TIPOS_.slice() }] },
    { hoja: SHEETS.VALORACIONES, columnas: [{ columna: COLUMNAS_NUM.VALORACIONES.TIPO, validos: ['Inicial', 'Seguimiento', 'Final'] }] }
  ];
}

function emojiClave_(v) { return textoSinEmoji_(v).toLowerCase(); }

/**
 * Convierte una lista de valores a su forma sin emoji.
 * @param {Array} valores valores de celda (cualquier tipo)
 * @param {string[]} validos valores correctos sin emoji de esa columna
 * @return {{nuevos: Array, cambios: Object<string,{a:string,n:number}>, desconocidos: Object<string,number>, filasCambiadas: number}}
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

/** Letra de columna (1 → A, 27 → AA). */
function emojiLetra_(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Recorta un texto para el informe (una sola línea). */
function emojiCorto_(v, max) {
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > (max || 40) ? s.slice(0, (max || 40) - 1) + '…' : s;
}

// ------------------------------------- LECTURA DE HOJAS -------------------------------------

/** Analiza UNA columna de etiquetas de una hoja: posición (1 = A), valores, filas que cambiarían y celdas con lista desplegable. */
function emojiAnalizarEtiqueta_(hoja, def) {
  const lastRow = hoja.getLastRow(), lastCol = hoja.getLastColumn();
  const nombre = def.campo || ('columna ' + emojiLetra_(def.columna));
  let columna = def.columna || 0;
  if (def.campo) {
    const headers = lastCol ? hoja.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim()) : [];
    const idx = headers.indexOf(def.campo);
    columna = idx === -1 ? 0 : idx + 1;
  }
  if (!columna || columna > lastCol) return { campo: nombre, columna: 0, filas: 0, analisis: null, filasCambio: [] };
  const filas = Math.max(lastRow - 1, 0);
  const rango = filas ? hoja.getRange(2, columna, filas, 1) : null;
  const valores = rango ? rango.getValues().map(r => r[0]) : [];
  let validaciones = 0;
  if (rango) rango.getDataValidations().forEach(r => { if (r[0]) validaciones++; });
  const analisis = emojiConvertir_(valores, def.validos);
  const filasCambio = [];
  analisis.nuevos.forEach((n, i) => { if (n !== valores[i]) filasCambio.push(i + 2); });
  return { campo: nombre, columna: columna, filas: filas, valores: valores, validaciones: validaciones, analisis: analisis, filasCambio: filasCambio };
}

/** Informe de una columna de etiquetas en el registro. */
function emojiLogColumna_(r) {
  if (!r.columna) { Logger.log('   · ' + r.campo + ': NO se encuentra la columna (se omite).'); return; }
  const a = r.analisis;
  Logger.log('   · ' + r.campo + ' (columna ' + r.columna + ', ' + r.filas + ' filas): ' + a.filasCambiadas + ' celda(s) a cambiar.');
  Object.keys(a.cambios).forEach(k => Logger.log('        "' + k + '" → "' + a.cambios[k].a + '"  (' + a.cambios[k].n + ')'));
  Object.keys(a.desconocidos).forEach(k => Logger.log('        NO RECONOCIDO, se deja igual: "' + k + '"  (' + a.desconocidos[k] + ')'));
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
  const filasAnt = [], filasNue = [];
  let cambiosAnt = 0, cambiosNue = 0;
  const desconocidos = {};
  datos.forEach((r, i) => {
    const validos = porCampo[String(r[2]).trim()];
    if (!validos) return;
    const a = emojiConvertir_([r[3]], validos), b = emojiConvertir_([r[4]], validos);
    if (a.nuevos[0] !== r[3]) { nuevoAnt[i] = a.nuevos[0]; cambiosAnt++; filasAnt.push(i + 2); }
    if (b.nuevos[0] !== r[4]) { nuevoNue[i] = b.nuevos[0]; cambiosNue++; filasNue.push(i + 2); }
    [a, b].forEach(x => Object.keys(x.desconocidos).forEach(k => { desconocidos[r[2] + ': ' + k] = (desconocidos[r[2] + ': ' + k] || 0) + 1; }));
  });
  return { filas: n, nuevoAnt: nuevoAnt, nuevoNue: nuevoNue, cambiosAnt: cambiosAnt, cambiosNue: cambiosNue, filasAnt: filasAnt, filasNue: filasNue, desconocidos: desconocidos };
}

/**
 * Celdas de texto con emoji de una hoja (cabeceras incluidas), salvo las de `excluir` (claves "fila:columna", ya tratadas como etiquetas).
 * Las celdas con fórmula no se tocan: se cuentan aparte.
 */
function emojiAnalizarTextoLibre_(hoja, excluir) {
  const lastRow = hoja.getLastRow(), lastCol = hoja.getLastColumn();
  const out = { cambios: [], enFormulas: 0, cabeceras: [] };
  if (!lastRow || !lastCol) return out;
  const rango = hoja.getRange(1, 1, lastRow, lastCol);
  const valores = rango.getValues(), formulas = rango.getFormulas();
  out.cabeceras = valores[0].map(h => String(h).trim());
  for (let r = 0; r < lastRow; r++) {
    for (let c = 0; c < lastCol; c++) {
      const v = valores[r][c], f = formulas[r][c];
      if (f) { if (emojiTiene_(f) || emojiTiene_(v)) out.enFormulas++; continue; }
      if (!emojiTiene_(v)) continue;
      if (excluir && excluir[(r + 1) + ':' + (c + 1)]) continue;
      out.cambios.push({ fila: r + 1, col: c + 1, antes: v, despues: emojiQuitar_(v) });
    }
  }
  return out;
}

/** Agrupa los cambios de texto libre por columna: { col: {nombre, n, ejemplos[]} }. */
function emojiAgruparPorColumna_(analisis) {
  const g = {};
  analisis.cambios.forEach(c => {
    if (!g[c.col]) g[c.col] = { nombre: analisis.cabeceras[c.col - 1] || ('columna ' + emojiLetra_(c.col)), n: 0, cabecera: 0, ejemplos: [] };
    g[c.col].n++;
    if (c.fila === 1) g[c.col].cabecera++;
    if (g[c.col].ejemplos.length < 3) g[c.col].ejemplos.push('fila ' + c.fila + ': "' + emojiCorto_(c.antes) + '"');
  });
  return g;
}

/**
 * Listas desplegables de una hoja. Devuelve cuántas celdas tienen una lista con emoji, cuántas por columna y la matriz de validaciones
 * YA limpia (solo si `construir` es true; para aplicarla con setDataValidations). Las listas «desde un rango» y las fórmulas personalizadas no se reescriben:
 * las primeras apuntan a celdas que limpia el texto libre; las segundas se avisan.
 */
function emojiAnalizarValidaciones_(hoja, construir) {
  const filas = hoja.getMaxRows(), cols = hoja.getMaxColumns();
  const out = { celdas: 0, porColumna: {}, formulas: 0, matriz: null, filas: filas, cols: cols };
  if (!filas || !cols) return out;
  const T = SpreadsheetApp.DataValidationCriteria;
  const matriz = hoja.getRange(1, 1, filas, cols).getDataValidations();
  const reglas = {};   // lista original → regla ya reconstruida (construir una por cada lista distinta, no una por celda: es lo lento)
  out.matriz = matriz.map((fila, r) => fila.map((dv, c) => {
    if (!dv) return dv;
    const tipo = dv.getCriteriaType(), vals = dv.getCriteriaValues() || [];
    if (tipo === T.VALUE_IN_LIST && Array.isArray(vals[0]) && vals[0].some(x => emojiTiene_(x))) {
      out.celdas++;
      out.porColumna[c + 1] = (out.porColumna[c + 1] || 0) + 1;
      if (!construir) return dv;
      const clave = JSON.stringify(vals);
      if (!reglas[clave]) {
        const limpios = [];
        vals[0].forEach(x => { const t = emojiQuitar_(x); if (t && limpios.indexOf(t) === -1) limpios.push(t); });
        reglas[clave] = dv.copy().requireValueInList(limpios, vals[1] !== false).build();
      }
      return reglas[clave];
    }
    if (tipo === T.CUSTOM_FORMULA && typeof vals[0] === 'string' && emojiTiene_(vals[0])) out.formulas++;
    return dv;
  }));
  return out;
}

/** Reglas de formato condicional cuya condición contiene un emoji (solo se avisan). */
function emojiAnalizarFormatos_(hoja) {
  const out = [];
  hoja.getConditionalFormatRules().forEach(regla => {
    const cond = regla.getBooleanCondition();
    if (!cond) return;
    const vals = (cond.getCriteriaValues() || []).filter(v => typeof v === 'string' && emojiTiene_(v));
    if (vals.length) out.push({ rangos: regla.getRanges().map(x => x.getA1Notation()).join(', '), valores: vals });
  });
  return out;
}

/** Cuántas notas de celda llevan emoji (solo se avisa). */
function emojiContarNotas_(hoja) {
  const filas = hoja.getMaxRows(), cols = hoja.getMaxColumns();
  if (!filas || !cols) return 0;
  let n = 0;
  hoja.getRange(1, 1, filas, cols).getNotes().forEach(f => f.forEach(x => { if (emojiTiene_(x)) n++; }));
  return n;
}

function emojiMarcar_(excluir, hojaNombre, columna, filas) {
  if (!excluir[hojaNombre]) excluir[hojaNombre] = {};
  filas.forEach(f => { excluir[hojaNombre][f + ':' + columna] = true; });
}

// ------------------------------------- FUNCIONES PARA EJECUTAR DESDE EL EDITOR -------------------------------------

/** SOLO LECTURA: qué cambiaría `quitarEmojis` y qué avisos hay. Mira el registro de ejecuciones. */
function revisarEmojis() {
  const ss = getSS();
  const excluir = {};
  let etiquetasPend = 0;
  Logger.log('=== Revisión de emojis (solo lectura; no se ha cambiado nada) ===');
  Logger.log('ETIQUETAS (valores cerrados, se convierten a su texto oficial):');
  emojiEtiquetas_().forEach(g => {
    const hoja = ss.getSheetByName(g.hoja);
    if (!hoja) { Logger.log(' Hoja "' + g.hoja + '": no existe, se omite.'); return; }
    Logger.log(' Hoja "' + g.hoja + '":');
    g.columnas.forEach(def => {
      const r = emojiAnalizarEtiqueta_(hoja, def);
      emojiLogColumna_(r);
      if (r.columna) { emojiMarcar_(excluir, g.hoja, r.columna, r.filasCambio); etiquetasPend += r.analisis.filasCambiadas; }
    });
  });
  const hist = ss.getSheetByName(SHEETS.HISTORIAL);
  const h = emojiAnalizarHistorial_(hist);
  if (!h) Logger.log(' Hoja "' + SHEETS.HISTORIAL + '": sin filas.');
  else {
    Logger.log(' Hoja "' + SHEETS.HISTORIAL + '" (' + h.filas + ' filas): ' + h.cambiosAnt + ' "Valor anterior" y ' + h.cambiosNue + ' "Valor nuevo" a cambiar.');
    Object.keys(h.desconocidos).forEach(k => Logger.log('        NO RECONOCIDO, se deja igual: "' + k + '"  (' + h.desconocidos[k] + ')'));
    emojiMarcar_(excluir, SHEETS.HISTORIAL, 4, h.filasAnt);
    emojiMarcar_(excluir, SHEETS.HISTORIAL, 5, h.filasNue);
    etiquetasPend += h.cambiosAnt + h.cambiosNue;
  }

  Logger.log('RESTO DE LA HOJA (por pestaña):');
  const nombresRaros = [];
  let pendientes = 0;
  ss.getSheets().forEach(hoja => {
    const nombre = hoja.getName();
    Logger.log(' … analizando la hoja "' + nombre + '"');
    if (emojiTiene_(nombre)) nombresRaros.push(nombre);
    const congelada = EMOJI_HOJAS_SIN_TOCAR_.test(nombre);
    const texto = emojiAnalizarTextoLibre_(hoja, excluir[nombre]);
    const val = emojiAnalizarValidaciones_(hoja, false);
    const formatos = emojiAnalizarFormatos_(hoja);
    const notas = emojiContarNotas_(hoja);
    if (!texto.cambios.length && !texto.enFormulas && !val.celdas && !val.formulas && !formatos.length && !notas) return;
    Logger.log(' Hoja "' + nombre + '"' + (congelada ? ' (archivo congelado: solo se informa, NO se toca)' : '') + ':');
    if (texto.cambios.length) {
      Logger.log('   · Texto con emoji: ' + texto.cambios.length + ' celda(s)' + (EMOJI_INCLUIR_TEXTO_LIBRE_ || congelada ? '' : ' (EMOJI_INCLUIR_TEXTO_LIBRE_ está en false: no se tocarán)') + '.');
      const g = emojiAgruparPorColumna_(texto);
      Object.keys(g).forEach(c => Logger.log('        columna ' + emojiLetra_(Number(c)) + ' "' + g[c].nombre + '": ' + g[c].n + (g[c].cabecera ? ' (incluida la cabecera)' : '') + '  ej. ' + g[c].ejemplos.join(' | ')));
      if (!congelada) pendientes += texto.cambios.length;
    }
    if (texto.enFormulas) Logger.log('   · AVISO: ' + texto.enFormulas + ' celda(s) con fórmula llevan emoji (no se tocan; revísalas a mano).');
    if (val.celdas) {
      Logger.log('   · Listas desplegables con emoji: ' + val.celdas + ' celda(s) (' + Object.keys(val.porColumna).map(c => emojiLetra_(Number(c)) + ': ' + val.porColumna[c]).join(', ') + ').');
      if (!congelada) pendientes += val.celdas;
    }
    if (val.formulas) Logger.log('   · AVISO: ' + val.formulas + ' validación(es) con fórmula personalizada llevan emoji (no se tocan; revísalas a mano).');
    formatos.forEach(f => Logger.log('   · AVISO formato condicional con emoji en ' + f.rangos + ': ' + f.valores.map(v => '"' + emojiCorto_(v) + '"').join(', ') + ' (no se toca; edítalo o bórralo en Sheets).'));
    if (notas) Logger.log('   · AVISO: ' + notas + ' nota(s) de celda llevan emoji (no se tocan).');
  });
  nombresRaros.forEach(n => Logger.log(' AVISO: el nombre de la pestaña "' + n + '" lleva emoji (no se cambia; renómbrala a mano si quieres; si el código la usa, debe coincidir con SHEETS).'));
  Logger.log('Pendiente de limpiar: ' + etiquetasPend + ' etiqueta(s) y ' + pendientes + ' celda(s) de texto libre o lista desplegable (sin contar la hoja congelada).');
  Logger.log(etiquetasPend + pendientes ? 'Siguiente paso: `quitarEmojis`.' : 'Todo limpio: no hay nada que cambiar (los AVISOS de arriba, si hay, son cosas que no toca la herramienta).');
}

/** ESCRIBE: quita los emojis de la hoja (ver cabecera). Se puede repetir sin problema. */
function quitarEmojis() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const t0 = Date.now();
  try {
    const ss = getSS();
    Logger.log('=== Quitar emojis ===');
    let total = 0;

    // 1. Etiquetas de valores cerrados.
    emojiEtiquetas_().forEach(g => {
      const hoja = ss.getSheetByName(g.hoja);
      if (!hoja) { Logger.log(' Hoja "' + g.hoja + '": no existe, se omite.'); return; }
      Logger.log(' Hoja "' + g.hoja + '":');
      g.columnas.forEach(def => {
        const r = emojiAnalizarEtiqueta_(hoja, def);
        emojiLogColumna_(r);
        if (!r.columna || !r.analisis.filasCambiadas) return;
        // Solo esa columna, con los valores ya convertidos (el resto de la fila no se toca).
        hoja.getRange(2, r.columna, r.filas, 1).setValues(r.analisis.nuevos.map(v => [v]));
        total += r.analisis.filasCambiadas;
      });
    });
    const hist = ss.getSheetByName(SHEETS.HISTORIAL);
    const h = emojiAnalizarHistorial_(hist);
    if (h && (h.cambiosAnt || h.cambiosNue)) {
      hist.getRange(2, 4, h.filas, 1).setValues(h.nuevoAnt.map(v => [v]));
      hist.getRange(2, 5, h.filas, 1).setValues(h.nuevoNue.map(v => [v]));
      total += h.cambiosAnt + h.cambiosNue;
      Logger.log(' Hoja "' + SHEETS.HISTORIAL + '": ' + h.cambiosAnt + ' anteriores y ' + h.cambiosNue + ' nuevos.');
    }
    SpreadsheetApp.flush();

    // 2 y 3. Listas desplegables y texto libre, hoja por hoja.
    let parado = false;
    ss.getSheets().forEach(hoja => {
      const nombre = hoja.getName();
      if (parado || EMOJI_HOJAS_SIN_TOCAR_.test(nombre)) return;
      if (Date.now() - t0 > EMOJI_TIEMPO_MAX_MS_) { parado = true; return; }
      const val = emojiAnalizarValidaciones_(hoja, true);
      if (val.celdas) {
        hoja.getRange(1, 1, val.filas, val.cols).setDataValidations(val.matriz);
        total += val.celdas;
        Logger.log(' Hoja "' + nombre + '": ' + val.celdas + ' celda(s) con lista desplegable reconstruida(s) sin emoji.');
      }
      if (!EMOJI_INCLUIR_TEXTO_LIBRE_) return;
      const texto = emojiAnalizarTextoLibre_(hoja, null);
      if (!texto.cambios.length) return;
      const g = emojiAgruparPorColumna_(texto);
      Logger.log(' Hoja "' + nombre + '": texto con emoji en ' + texto.cambios.length + ' celda(s).');
      Object.keys(g).forEach(c => Logger.log('        columna ' + emojiLetra_(Number(c)) + ' "' + g[c].nombre + '": ' + g[c].n + '  ej. ' + g[c].ejemplos.join(' | ')));
      for (let i = 0; i < texto.cambios.length; i++) {
        if (Date.now() - t0 > EMOJI_TIEMPO_MAX_MS_) { parado = true; Logger.log('        (tiempo casi agotado: quedan ' + (texto.cambios.length - i) + ' celda(s) de esta hoja)'); break; }
        const c = texto.cambios[i];
        hoja.getRange(c.fila, c.col).setValue(c.despues);
        total++;
      }
    });
    SpreadsheetApp.flush();
    Logger.log('Hecho: ' + total + ' cambio(s).');
    if (parado) Logger.log('Se paró por tiempo: vuelve a ejecutar `quitarEmojis` para terminar (lo ya limpio no cambia).');
    Logger.log('Siguiente paso: ejecuta `revisarEmojis` y comprueba que ya no queda nada por cambiar.');
  } finally {
    try { lock.releaseLock(); } catch (e) { /* sin bloqueo que liberar */ }
  }
}
