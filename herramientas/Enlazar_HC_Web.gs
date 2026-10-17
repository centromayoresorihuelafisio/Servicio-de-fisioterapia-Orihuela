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
 * Uso (desde el editor de Apps Script, sin menú):
 *   1) enlazarHCaFichaWeb()      → calcula, te enseña el resumen y pide confirmación antes de escribir nada.
 *   2) revertirEnlacesHCaDocs()  → vuelve a enlazar los Docs originales (por si hubiera que deshacer).
 * Requiere que la Web App esté desplegada (se usa su URL).
 */

const ENL_HC_ = {
  HOJA_LOG: 'Enlaces HC',
  TEXTO: 'Ver Historia Clínica',
  MARGEN_MS: 4.5 * 60 * 1000,
  TOLERANCIA_MS: 2 * 60 * 1000     // el Doc cuenta como modificado si es >2 min posterior a lo anotado al migrar
};

function enlazarHCaFichaWeb() {
  const ui = SpreadsheetApp.getUi();
  const inicio = Date.now();
  const ctx = enlHC_contexto_();
  const plan = [];      // { fila, nombre, resultado, detalle, urlAntes, nuevo }
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

  const n = function (r) { return plan.filter(function (p) { return p.resultado === r; }).length; };
  const aCambiar = plan.filter(function (p) { return p.resultado === 'Cambiar'; });
  enlHC_escribirLog_(ctx.ss, plan);
  if (!aCambiar.length) {
    ui.alert('Enlazar HC a la ficha web', 'No hay enlaces que cambiar.\n\nYa enlazadas: ' + n('Ya enlazada') + '\nDoc modificado tras migrar: ' + n('Doc modificado después de migrar') +
      '\nSin migrar / revisar: ' + (n('Sin migrar') + n('Revisar')) + '\n\nDetalle en la hoja "' + ENL_HC_.HOJA_LOG + '".', ui.ButtonSet.OK);
    return;
  }
  const r = ui.alert('Enlazar HC a la ficha web',
    'Se cambiarán ' + aCambiar.length + ' enlaces de la Maestra para que abran la ficha web.\n\n' +
    'Ya enlazadas: ' + n('Ya enlazada') + '\nSe dejan con su Doc (modificado después de migrar): ' + n('Doc modificado después de migrar') +
    '\nSin migrar / revisar: ' + (n('Sin migrar') + n('Revisar')) + (hastaCorte ? '\n\n(Se agotó el tiempo: tras esto, vuelve a ejecutarla para el resto.)' : '') +
    '\n\nLos Docs no se tocan y se puede deshacer con revertirEnlacesHCaDocs().\n\n¿Continuar?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) { ctx.ss.toast('No se ha cambiado nada.', 'Enlazar HC', 6); return; }

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
  aCambiar.forEach(function (p) { const u = rel[p.fila - 2][0] && rel[p.fila - 2][0].getLinkUrl(); if (u !== p.nuevo) { mal++; p.resultado = 'Error de escritura'; } else p.resultado = 'Cambiada'; });
  enlHC_escribirLog_(ctx.ss, plan);
  ui.alert('Enlazar HC a la ficha web', mal ? 'Atención: ' + mal + ' enlaces no se escribieron bien. Revisa la hoja "' + ENL_HC_.HOJA_LOG + '".'
    : '✅ ' + aCambiar.length + ' enlaces cambiados y verificados.\n\nAhora "Historia" abre la ficha web. Para el resto de filas, mira la hoja "' + ENL_HC_.HOJA_LOG + '".', ui.ButtonSet.OK);
}

/** Deshace enlazarHCaFichaWeb(): vuelve a enlazar cada fila a su Doc original (guardado en "Historias Clínicas"). */
function revertirEnlacesHCaDocs() {
  const ui = SpreadsheetApp.getUi();
  const ctx = enlHC_contexto_();
  const ricos = ctx.ricos.map(function (f) { return [f[0]]; });
  let n = 0, sinDoc = 0;
  ctx.links.forEach(function (l) {
    if (!hcEsFichaWeb_(l.url)) return;
    const hc = ctx.porId[hcIdDeUrl_(l.url)];
    if (!hc || !/^https?:/i.test(hc.doc)) { sinDoc++; return; }     // HC creada ya en la web: no tiene Doc al que volver
    ricos[l.fila - 2] = [SpreadsheetApp.newRichTextValue().setText(ENL_HC_.TEXTO).setLinkUrl(hc.doc).build()];
    n++;
  });
  if (!n) { ui.alert('No hay enlaces que revertir (sin Doc original: ' + sinDoc + ').'); return; }
  if (ui.alert('Revertir enlaces', 'Se volverán a enlazar ' + n + ' historias a su Google Doc original. Las que se crearon directamente en la web (' + sinDoc + ') no tienen Doc y se quedan como están.\n\nLo escrito en la ficha web desde la migración NO pasa a los Docs.\n\n¿Continuar?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  ctx.hoja.getRange(2, ctx.colHC + 1, ricos.length, 1).setRichTextValues(ricos);
  SpreadsheetApp.flush();
  ui.alert('✅ ' + n + ' enlaces restaurados a sus Docs.');
}

// ----------------------------------------------------------------------------- internas

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
