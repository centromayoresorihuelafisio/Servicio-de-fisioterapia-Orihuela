/**
 * Cambia la columna "Historia clínica" de la Maestra: de enlazar al Google Doc a enlazar a la ficha web
 * (?page=hc&id=ID_HC). Es el paso que hace DEFINITIVO el formato nuevo de historia clínica.
 *
 * SEGURIDAD
 *  - No toca los Docs ni las hojas "Historias Clínicas" / "Episodios HC". Solo cambia el texto/enlace de esa columna.
 *  - La URL del Doc de cada historia queda guardada en "Historias Clínicas" (columna "Doc original"), así que el cambio
 *    se puede deshacer con revertirEnlacesHCaDocs().
 *  - Una HC cuyo Doc se haya modificado DESPUÉS de migrarla NO se cambia (se perderían esos cambios): sale en la hoja
 *    "Enlaces HC" para que la revises.
 *  - Idempotente: los enlaces que ya apuntan a la ficha web se saltan. Si se agota el tiempo, vuelve a ejecutarla.
 *
 * Uso (desde el editor de Apps Script, sin menú; los mensajes salen en el "Registro de ejecución"):
 *   1) previsualizarEnlacesHC()              → NO escribe en la Maestra; deja el plan en la hoja "Enlaces HC".
 *   2) enlazarHCaFichaWeb()                  → aplica el cambio y lo verifica.
 *   3) revertirEnlacesHCaDocs()              → solo cuenta lo que se restauraría;
 *      revertirEnlacesHCaDocsConfirmado()    → vuelve a enlazar los Docs originales (deshacer).
 * Requiere que la Web App esté desplegada (se usa su URL).
 */

const ENL_HC_ = {
  HOJA_LOG: 'Enlaces HC',
  TEXTO: 'Ver Historia Clínica',
  MARGEN_MS: 4.5 * 60 * 1000,
  TOLERANCIA_MS: 2 * 60 * 1000     // el Doc cuenta como modificado si es >2 min posterior a lo anotado al migrar
};

/** PASO 1 (no escribe en la Maestra): calcula qué se cambiaría y lo deja en la hoja "Enlaces HC" y en el registro. */
function previsualizarEnlacesHC() {
  const ctx = enlHC_contexto_();
  const r = enlHC_calcularPlan_(ctx);
  enlHC_escribirLog_(ctx.ss, r.plan);
  enlHC_aviso_('Vista previa: se cambiarían ' + enlHC_n_(r.plan, 'Cambiar') + ' enlaces. ' + enlHC_resumen_(r) +
    '\nNo se ha escrito nada en la Maestra. Revisa la hoja "' + ENL_HC_.HOJA_LOG + '" y, si todo está bien, ejecuta enlazarHCaFichaWeb().');
}

/** PASO 2: aplica el cambio de enlaces (recalcula el plan en el momento). Se puede deshacer con revertirEnlacesHCaDocs(). */
function enlazarHCaFichaWeb() {
  const ctx = enlHC_contexto_();
  const r = enlHC_calcularPlan_(ctx);
  const plan = r.plan, aCambiar = plan.filter(function (p) { return p.resultado === 'Cambiar'; });
  if (!aCambiar.length) {
    enlHC_escribirLog_(ctx.ss, plan);
    enlHC_aviso_('No hay enlaces que cambiar. ' + enlHC_resumen_(r));
    return;
  }
  // Se escribe la columna entera de una vez, reutilizando los valores originales en las filas que no cambian.
  const nuevos = ctx.ricos.map(function (fila) { return [fila[0]]; });
  aCambiar.forEach(function (p) {
    nuevos[p.fila - 2] = [SpreadsheetApp.newRichTextValue().setText(ENL_HC_.TEXTO).setLinkUrl(p.nuevo).build()];
  });
  ctx.hoja.getRange(2, ctx.colHC + 1, nuevos.length, 1).setRichTextValues(nuevos);
  SpreadsheetApp.flush();

  // Comprobación posterior: releer y verificar que cada fila cambiada apunta a su ficha.
  const rel = ctx.hoja.getRange(2, ctx.colHC + 1, nuevos.length, 1).getRichTextValues();
  let mal = 0;
  aCambiar.forEach(function (p) {
    const u = rel[p.fila - 2][0] && rel[p.fila - 2][0].getLinkUrl();
    if (u !== p.nuevo) { mal++; p.resultado = 'Error de escritura'; } else p.resultado = 'Cambiada';
  });
  enlHC_escribirLog_(ctx.ss, plan);
  enlHC_aviso_(mal ? 'ATENCIÓN: ' + mal + ' enlaces no se escribieron bien. Revisa la hoja "' + ENL_HC_.HOJA_LOG + '".'
    : '✅ ' + aCambiar.length + ' enlaces cambiados y verificados. ' + enlHC_resumen_(r) + ' Detalle en la hoja "' + ENL_HC_.HOJA_LOG + '".' +
      (r.hastaCorte ? ' (Se agotó el tiempo: vuelve a ejecutarla para el resto.)' : ''));
}

/** Deshacer, paso 1: solo cuenta cuántos enlaces se restaurarían. */
function revertirEnlacesHCaDocs() {
  const r = enlHC_planRevertir_(enlHC_contexto_());
  enlHC_aviso_('Se restaurarían ' + r.n + ' enlaces a su Doc original (' + r.sinDoc + ' creadas en la web no tienen Doc y se quedan). ' +
    'Para hacerlo de verdad ejecuta revertirEnlacesHCaDocsConfirmado().');
}

/** Deshacer, paso 2: vuelve a enlazar cada fila a su Doc original (guardado en "Historias Clínicas"). */
function revertirEnlacesHCaDocsConfirmado() {
  const ctx = enlHC_contexto_();
  const r = enlHC_planRevertir_(ctx);
  if (!r.n) { enlHC_aviso_('No hay enlaces que revertir.'); return; }
  ctx.hoja.getRange(2, ctx.colHC + 1, r.ricos.length, 1).setRichTextValues(r.ricos);
  SpreadsheetApp.flush();
  enlHC_aviso_('✅ ' + r.n + ' enlaces restaurados a sus Docs. Lo escrito en la ficha web desde la migración no pasa a los Docs.');
}

// ----------------------------------------------------------------------------- internas

/** Se ejecuta desde el editor de Apps Script, donde no hay diálogos: el mensaje va al registro (y a un aviso en la hoja si está abierta). */
function enlHC_aviso_(msg) {
  Logger.log(msg);
  try { getSS().toast(msg.slice(0, 200), 'Enlazar HC', 10); } catch (e) { /* sin hoja abierta */ }
}
function enlHC_n_(plan, r) { return plan.filter(function (p) { return p.resultado === r; }).length; }
function enlHC_resumen_(r) {
  const n = function (x) { return enlHC_n_(r.plan, x); };
  return 'Ya enlazadas: ' + n('Ya enlazada') + ' · Doc modificado tras migrar (se dejan con su Doc): ' + n('Doc modificado después de migrar') +
    ' · Sin migrar/revisar: ' + (n('Sin migrar') + n('Revisar')) + '.';
}

function enlHC_calcularPlan_(ctx) {
  const inicio = Date.now(), plan = [];
  let hastaCorte = false;
  ctx.links.forEach(function (l) {
    if (hastaCorte) return;
    if (Date.now() - inicio > ENL_HC_.MARGEN_MS) { hastaCorte = true; return; }
    if (!l.url) return;
    if (hcEsFichaWeb_(l.url)) { plan.push({ fila: l.fila, nombre: l.nombre, resultado: 'Ya enlazada', detalle: '', urlAntes: l.url }); return; }
    const docId = (l.url.match(/[-\w]{25,}/) || [''])[0];
    const hc = docId ? ctx.porDoc[docId] : null;
    if (!hc) { plan.push({ fila: l.fila, nombre: l.nombre, resultado: 'Sin migrar', detalle: 'Su Doc no está en "Historias Clínicas".', urlAntes: l.url }); return; }
    let docMod = 0;
    try { docMod = DriveApp.getFileById(docId).getLastUpdated().getTime(); } catch (e) {
      plan.push({ fila: l.fila, nombre: l.nombre, resultado: 'Revisar', detalle: 'No se pudo leer el Doc: ' + e.message, urlAntes: l.url }); return;
    }
    if (hc.modificado && docMod > hc.modificado + ENL_HC_.TOLERANCIA_MS) {
      plan.push({ fila: l.fila, nombre: l.nombre, resultado: 'Doc modificado después de migrar', detalle: 'Doc: ' + new Date(docMod) + ' · migrada/editada en web: ' + new Date(hc.modificado) + '. Se deja el enlace al Doc.', urlAntes: l.url });
      return;
    }
    plan.push({ fila: l.fila, nombre: l.nombre, resultado: 'Cambiar', detalle: '', urlAntes: l.url, nuevo: hcUrlFicha_(hc.id) });
  });
  return { plan: plan, hastaCorte: hastaCorte };
}

function enlHC_planRevertir_(ctx) {
  const ricos = ctx.ricos.map(function (f) { return [f[0]]; });
  let n = 0, sinDoc = 0;
  ctx.links.forEach(function (l) {
    if (!hcEsFichaWeb_(l.url)) return;
    const hc = ctx.porId[hcIdDeUrl_(l.url)];
    if (!hc || !/^https?:/i.test(hc.doc)) { sinDoc++; return; }
    ricos[l.fila - 2] = [SpreadsheetApp.newRichTextValue().setText(ENL_HC_.TEXTO).setLinkUrl(hc.doc).build()];
    n++;
  });
  return { ricos: ricos, n: n, sinDoc: sinDoc };
}

function enlHC_contexto_() {
  const ss = getSS();
  const hoja = ss.getSheetByName(SHEETS.MAESTRA);
  const hcs = ss.getSheetByName('Historias Clínicas');
  if (!hoja || !hcs) throw new Error('Faltan las hojas "' + SHEETS.MAESTRA + '" o "Historias Clínicas".');
  const colHC = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  const colNom = obtenerIndiceColumnaPorNombre_(hoja, COLUMNAS.MAESTRA.NOMBRE);
  if (colHC === -1 || colNom === -1) throw new Error('No se encontró la columna "Historia clínica" o "Nombre" en la Maestra.');
  const ult = hoja.getLastRow();
  const ricos = ult > 1 ? hoja.getRange(2, colHC + 1, ult - 1, 1).getRichTextValues() : [];
  const valores = ult > 1 ? hoja.getRange(2, 1, ult - 1, Math.max(colHC, colNom) + 1).getValues() : [];
  const links = ricos.map(function (r, i) {
    const url = extraerUrlHistoriaClinica(valores[i][colHC], r[0], '');
    return { fila: i + 2, nombre: valores[i][colNom], url: url };
  });
  const porDoc = {}, porId = {};
  if (hcs.getLastRow() > 1) hcs.getRange(2, 1, hcs.getLastRow() - 1, 7).getValues().forEach(function (r) {
    const doc = String(r[6] || '');
    const d = (doc.match(/[-\w]{25,}/) || [''])[0];
    const e = { id: String(r[0]), modificado: hcMs_(r[4]), doc: doc };
    if (d) porDoc[d] = e;
    porId[e.id] = e;
  });
  return { ss: ss, hoja: hoja, colHC: colHC, ricos: ricos, links: links, porDoc: porDoc, porId: porId };
}

function enlHC_escribirLog_(ss, plan) {
  let h = ss.getSheetByName(ENL_HC_.HOJA_LOG);
  if (!h) h = ss.insertSheet(ENL_HC_.HOJA_LOG);
  h.clear();
  h.getRange(1, 1, 1, 5).setValues([['Fila Maestra', 'Nombre', 'Resultado', 'Detalle', 'Enlace anterior']]).setFontWeight('bold');
  if (plan.length) h.getRange(2, 1, plan.length, 5).setValues(plan.map(function (p) { return [p.fila, p.nombre, p.resultado, p.detalle, p.urlAntes]; }));
  h.setFrozenRows(1);
}
