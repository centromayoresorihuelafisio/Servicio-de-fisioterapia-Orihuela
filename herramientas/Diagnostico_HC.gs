/**
 * DIAGNÓSTICO DE HISTORIAS CLÍNICAS (SOLO LECTURA)
 *
 * Recorre los Google Docs de historia clínica enlazados en la Base de Datos
 * Maestra y vuelca un informe en la hoja "Diagnóstico HC". NO modifica ningún
 * Doc, ni la Maestra, ni la carpeta de Drive: lo único que escribe son las
 * hojas "Diagnóstico HC" y "Diagnóstico HC (resumen)", que se pueden borrar
 * cuando ya no hagan falta.
 *
 * Para qué sirve: antes de migrar las HC a la app, saber cuántas siguen la
 * estructura de la plantilla (tablas ASISTENCIA, DATOS PERSONALES e
 * HISTORIA/TRATAMIENTO) y cuáles tienen cosas raras (imágenes, listas o tablas
 * dentro de Historia/Tratamiento, marcadores {{...}} sin sustituir, datos que no
 * coinciden con la Maestra, "Estado civil" rellenado a mano, etc.).
 *
 * Cómo usarlo (desde el editor de Apps Script, sin menú):
 *   1. Ejecuta `diagnosticarHistoriasClinicas`. Procesa durante ~4,5 minutos y
 *      se detiene guardando por dónde va.
 *   2. Si el aviso dice "Quedan N", vuelve a ejecutarla: continúa donde lo dejó.
 *   3. Al terminar crea la hoja "Diagnóstico HC (resumen)". Pásame ese resumen.
 *   Para empezar de cero: `reiniciarDiagnosticoHC` y luego la función de arriba.
 *
 * Archivo nuevo en herramientas/. Todos los nombres llevan el prefijo diagHC_ /
 * DIAG_HC_ para no chocar con el ámbito global compartido del proyecto.
 */

const DIAG_HC_ = {
  HOJA: 'Diagnóstico HC',
  HOJA_RESUMEN: 'Diagnóstico HC (resumen)',
  PROP_CURSOR: 'DIAG_HC_ULTIMA_FILA',
  MARGEN_MS: 4.5 * 60 * 1000,   // el límite de Apps Script son 6 min por ejecución
  LOTE: 25                      // cada cuántos Docs se escribe en la hoja
};

const DIAG_HC_CABECERAS_ = [
  'Fila Maestra', 'Nombre (Maestra)', 'Enlace', 'Resultado', 'Observaciones',
  'Tablas en el Doc', 'Tabla asistencia', 'Ingresos rellenos', 'Altas rellenas',
  'Tabla datos personales', 'Estado civil (en el Doc)', 'Nombre coincide', 'DNI coincide',
  'Tabla historia/tratamiento', 'Caracteres Historia', 'Caracteres Tratamiento',
  'Formato en Historia/Tratamiento', 'Imágenes', 'Texto fuera de tablas (caracteres)',
  'Texto fuera de tablas (inicio)', 'Marcadores {{ sin sustituir'
];

/** Punto de entrada: ejecútalo desde el editor. Es reanudable. */
function diagnosticarHistoriasClinicas() {
  const inicio = Date.now();
  const ss = getSS();
  const props = PropertiesService.getScriptProperties();

  const items = diagHC_listarHistorias_(ss);
  if (!items.length) {
    ss.toast('No hay historias clínicas enlazadas en la Maestra.', 'Diagnóstico HC', 8);
    return;
  }

  let hoja = ss.getSheetByName(DIAG_HC_.HOJA);
  const ultimaFila = parseInt(props.getProperty(DIAG_HC_.PROP_CURSOR) || '0', 10);
  if (!hoja || ultimaFila === 0) {
    if (hoja) ss.deleteSheet(hoja);
    hoja = ss.insertSheet(DIAG_HC_.HOJA);
    hoja.getRange(1, 1, 1, DIAG_HC_CABECERAS_.length).setValues([DIAG_HC_CABECERAS_]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    props.deleteProperty(DIAG_HC_.PROP_CURSOR);
  }

  const pendientes = items.filter(function (it) { return it.fila > ultimaFila; });
  let buffer = [];
  let ultimaProcesada = ultimaFila;
  let hechos = 0;

  const volcar = function () {
    if (!buffer.length) return;
    hoja.getRange(hoja.getLastRow() + 1, 1, buffer.length, DIAG_HC_CABECERAS_.length).setValues(buffer);
    props.setProperty(DIAG_HC_.PROP_CURSOR, String(ultimaProcesada));
    buffer = [];
  };

  for (let k = 0; k < pendientes.length; k++) {
    if (Date.now() - inicio > DIAG_HC_.MARGEN_MS) break;
    const it = pendientes[k];
    buffer.push(diagHC_analizarItem_(it));
    ultimaProcesada = it.fila;
    hechos++;
    if (buffer.length >= DIAG_HC_.LOTE) volcar();
  }
  volcar();

  const quedan = pendientes.length - hechos;
  if (quedan > 0) {
    ss.toast('Procesadas ' + hechos + ' en esta pasada. Quedan ' + quedan + ': vuelve a ejecutar diagnosticarHistoriasClinicas.', 'Diagnóstico HC', 15);
  } else {
    diagHC_escribirResumen_(ss, hoja, items);
    props.deleteProperty(DIAG_HC_.PROP_CURSOR);
    ss.toast('Terminado. Revisa la hoja "' + DIAG_HC_.HOJA_RESUMEN + '".', 'Diagnóstico HC', 15);
  }
}

/** Borra el progreso guardado (no toca las hojas ya creadas). */
function reiniciarDiagnosticoHC() {
  PropertiesService.getScriptProperties().deleteProperty(DIAG_HC_.PROP_CURSOR);
  getSS().toast('Progreso reiniciado. Ejecuta diagnosticarHistoriasClinicas.', 'Diagnóstico HC', 8);
}

/* ---------------------------------------------------------------------- */

/** Lista [{fila, nombre, dni, url, docId}] de los usuarios con HC enlazada. */
function diagHC_listarHistorias_(ss) {
  const sheet = ss.getSheetByName(SHEETS.MAESTRA);
  if (!sheet) throw new Error("No se encontró la hoja '" + SHEETS.MAESTRA + "'.");
  const rango = sheet.getDataRange();
  const values = rango.getValues();
  const ricos = rango.getRichTextValues();
  const formulas = rango.getFormulas();
  if (values.length < 2) return [];

  const cab = values[0].map(function (h) { return h.toString().trim(); });
  const cNombre = cab.indexOf(COLUMNAS.MAESTRA.NOMBRE);
  const cDni = cab.indexOf(COLUMNAS.MAESTRA.DNI);
  const cHC = cab.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA);
  if (cNombre === -1 || cHC === -1) throw new Error("No se hallan las columnas 'Nombre' o 'Historia clínica' en la Maestra.");

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const nombre = values[i][cNombre] ? values[i][cNombre].toString().trim() : '';
    if (!nombre) continue;
    const url = extraerUrlHistoriaClinica(values[i][cHC], ricos[i][cHC], formulas[i][cHC]);
    if (!url) continue;
    const m = url.match(/[-\w]{25,}/);
    items.push({
      fila: i + 1,
      nombre: nombre,
      dni: cDni !== -1 && values[i][cDni] ? values[i][cDni].toString().trim() : '',
      url: url,
      docId: m ? m[0] : ''
    });
  }
  return items;
}

/** Abre el Doc y devuelve la fila de la hoja de informe. Nunca lanza error. */
function diagHC_analizarItem_(it) {
  let r;
  try {
    if (!it.docId) throw new Error('Enlace sin identificador de Doc');
    const doc = DocumentApp.openById(it.docId);
    r = diagHC_analizarDoc_(doc, it);
  } catch (e) {
    r = { resultado: 'Error', obs: ['No se pudo abrir: ' + e.message] };
  }
  return diagHC_aFila_(it, r);
}

/**
 * Lógica pura sobre un objeto Document (así se puede probar con simulacros).
 * Devuelve un objeto con todas las medidas.
 */
function diagHC_analizarDoc_(doc, it) {
  const body = doc.getBody();
  const tablas = body.getTables();
  const obs = [];
  const r = { tablas: tablas.length };

  // ---- localizar las tres tablas de la plantilla ----
  let tAsist = null, tDatos = null, tHist = null;
  tablas.forEach(function (t) {
    let primera = '', texto = '';
    try { primera = normalizarTexto(t.getCell(0, 0).getText()); } catch (e) { /* tabla vacía */ }
    try { texto = normalizarTexto(t.getText()); } catch (e) { /* ignorar */ }
    let fila0 = '';
    try { fila0 = normalizarTexto(t.getRow(0).getText()); } catch (e) { /* ignorar */ }
    if (!tHist && fila0.indexOf('historia') !== -1 && fila0.indexOf('tratamiento') !== -1) tHist = t;
    else if (!tDatos && texto.indexOf('nombre') !== -1 && (texto.indexOf('dni') !== -1 || texto.indexOf('telefono') !== -1)) tDatos = t;
    else if (!tAsist && (primera.indexOf('asistencia') !== -1 || primera.indexOf('ingreso') !== -1 || texto.indexOf('ingreso') !== -1)) tAsist = t;
  });

  // ---- asistencia: ingresos y altas rellenos ----
  r.tAsist = !!tAsist;
  r.ingresos = 0; r.altas = 0;
  if (tAsist) {
    for (let i = 0; i < tAsist.getNumRows(); i++) {
      const fila = tAsist.getRow(i);
      const n = fila.getNumCells();
      const c0 = n > 0 ? fila.getCell(0).getText().trim() : '';
      const c1 = n > 1 ? fila.getCell(1).getText().trim() : '';
      const u0 = normalizarTexto(c0), u1 = normalizarTexto(c1);
      if (u0 === 'asistencia' || u0 === 'ingreso' || u1 === 'alta') continue;   // cabeceras
      if (c0) r.ingresos++;
      if (c1 && u1 !== 'fecha') r.altas++;
    }
  } else obs.push('sin tabla de asistencia');

  // ---- datos personales ----
  r.tDatos = !!tDatos;
  r.estadoCivil = ''; r.nombreOk = ''; r.dniOk = '';
  if (tDatos) {
    const v = {};
    for (let i = 0; i < tDatos.getNumRows(); i++) {
      const fila = tDatos.getRow(i);
      for (let c = 0; c < fila.getNumCells() - 1; c++) {
        const etiqueta = normalizarTexto(fila.getCell(c).getText());
        if (etiqueta === 'nombre' || etiqueta === 'dni' || etiqueta === 'estado civil') {
          v[etiqueta] = fila.getCell(c + 1).getText().trim();
        }
      }
    }
    r.estadoCivil = v['estado civil'] || '';
    const limpiar = function (s) { return normalizarTexto(s).replace(/[^a-z0-9]/g, ''); };
    if (v['nombre'] !== undefined) {
      r.nombreOk = limpiar(v['nombre']) === limpiar(it.nombre) ? 'sí' : 'NO';
      if (r.nombreOk === 'NO') obs.push('el nombre del Doc no coincide con la Maestra ("' + v['nombre'] + '")');
    }
    if (v['dni'] !== undefined && (v['dni'] || it.dni)) {
      r.dniOk = limpiar(v['dni']) === limpiar(it.dni) ? 'sí' : 'NO';
      if (r.dniOk === 'NO') obs.push('el DNI del Doc no coincide con la Maestra');
    }
  } else obs.push('sin tabla de datos personales');

  // ---- historia y tratamiento ----
  r.tHist = !!tHist;
  r.charsHist = 0; r.charsTrat = 0; r.formato = '';
  if (tHist) {
    const flags = {};
    for (let i = 1; i < tHist.getNumRows(); i++) {
      const fila = tHist.getRow(i);
      for (let c = 0; c < Math.min(2, fila.getNumCells()); c++) {
        const celda = fila.getCell(c);
        const len = celda.getText().replace(/\s+/g, ' ').trim().length;
        if (c === 0) r.charsHist += len; else r.charsTrat += len;
        diagHC_inspeccionarCelda_(celda, flags);
      }
    }
    if (tHist.getNumRows() > 2) obs.push('la tabla tiene ' + tHist.getNumRows() + ' filas (se esperaban 2)');
    if (flags.tabla) obs.push('hay una tabla dentro de Historia/Tratamiento');
    if (flags.lista) obs.push('hay listas dentro de Historia/Tratamiento');
    if (flags.imagen) obs.push('hay imágenes dentro de Historia/Tratamiento');
    r.formato = ['negrita', 'cursiva', 'subrayado', 'enlace'].filter(function (k) { return flags[k]; }).join(', ');
    r.hayProblemaCelda = !!(flags.tabla || flags.lista || flags.imagen);
  } else obs.push('sin tabla historia/tratamiento');

  // ---- imágenes y texto fuera de las tablas ----
  let imagenes = 0;
  try { imagenes = body.getImages().length; } catch (e) { /* ignorar */ }
  r.imagenes = imagenes;
  if (imagenes) obs.push('el Doc contiene ' + imagenes + ' imagen(es)');

  let fuera = '';
  const T = DocumentApp.ElementType;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const ch = body.getChild(i);
    const tipo = ch.getType();
    if (tipo === T.PARAGRAPH || tipo === T.LIST_ITEM) {
      const crudo = tipo === T.PARAGRAPH ? ch.asParagraph().getText() : ch.asListItem().getText();
      const tx = crudo.replace(/\s+/g, ' ').trim();
      if (tx) fuera += (fuera ? ' ' : '') + tx;
    }
  }
  r.fueraLen = fuera.length;
  r.fueraTxt = fuera.slice(0, 60);
  if (fuera.length > 80) obs.push('hay texto fuera de las tablas (' + fuera.length + ' caracteres)');

  // ---- marcadores sin sustituir ----
  r.marcadores = body.getText().indexOf('{{') !== -1 ? 'SÍ' : '';
  if (r.marcadores) obs.push('quedan marcadores {{...}} sin sustituir');

  r.obs = obs;
  const problema = !tAsist || !tDatos || !tHist || imagenes > 0 || r.hayProblemaCelda ||
    r.marcadores || r.nombreOk === 'NO' || r.dniOk === 'NO' || fuera.length > 80;
  r.resultado = problema ? 'Revisar' : 'OK';
  return r;
}

/** Marca en `flags` qué hay dentro de una celda (tabla, lista, imagen, estilos). */
function diagHC_inspeccionarCelda_(celda, flags) {
  const T = DocumentApp.ElementType;
  try {
    for (let i = 0; i < celda.getNumChildren(); i++) {
      const tipo = celda.getChild(i).getType();
      if (tipo === T.TABLE) flags.tabla = true;
      if (tipo === T.LIST_ITEM) flags.lista = true;
    }
    if (celda.findElement(T.INLINE_IMAGE)) flags.imagen = true;
  } catch (e) { /* ignorar */ }
  try {
    const tx = celda.editAsText();
    const idx = tx.getTextAttributeIndices();
    for (let k = 0; k < Math.min(idx.length, 300); k++) {
      const p = idx[k];
      if (tx.isBold(p)) flags.negrita = true;
      if (tx.isItalic(p)) flags.cursiva = true;
      if (tx.isUnderline(p) && !tx.getLinkUrl(p)) flags.subrayado = true;
      if (tx.getLinkUrl(p)) flags.enlace = true;
    }
  } catch (e) { /* ignorar */ }
}

function diagHC_aFila_(it, r) {
  const si = function (b) { return b ? 'sí' : 'NO'; };
  return [
    it.fila, it.nombre, it.url, r.resultado, (r.obs || []).join(' · '),
    r.tablas !== undefined ? r.tablas : '', r.tAsist !== undefined ? si(r.tAsist) : '',
    r.ingresos !== undefined ? r.ingresos : '', r.altas !== undefined ? r.altas : '',
    r.tDatos !== undefined ? si(r.tDatos) : '', r.estadoCivil || '', r.nombreOk || '', r.dniOk || '',
    r.tHist !== undefined ? si(r.tHist) : '', r.charsHist !== undefined ? r.charsHist : '',
    r.charsTrat !== undefined ? r.charsTrat : '', r.formato || '', r.imagenes !== undefined ? r.imagenes : '',
    r.fueraLen !== undefined ? r.fueraLen : '', r.fueraTxt || '', r.marcadores || ''
  ];
}

/** Resumen final en una hoja aparte (cuenta sobre lo ya volcado en "Diagnóstico HC"). */
function diagHC_escribirResumen_(ss, hoja, items) {
  const datos = hoja.getLastRow() > 1 ? hoja.getRange(2, 1, hoja.getLastRow() - 1, DIAG_HC_CABECERAS_.length).getValues() : [];
  const col = function (nombre) { return DIAG_HC_CABECERAS_.indexOf(nombre); };
  const cuenta = function (fn) { return datos.filter(fn).length; };
  const num = function (v) { return typeof v === 'number' ? v : (parseInt(v, 10) || 0); };

  const filas = [
    ['Historias clínicas enlazadas analizadas', datos.length],
    ['OK (estructura de la plantilla, sin rarezas)', cuenta(function (f) { return f[col('Resultado')] === 'OK'; })],
    ['Revisar (algo distinto de la plantilla)', cuenta(function (f) { return f[col('Resultado')] === 'Revisar'; })],
    ['Error (no se pudo abrir)', cuenta(function (f) { return f[col('Resultado')] === 'Error'; })],
    ['', ''],
    ['Sin tabla de asistencia', cuenta(function (f) { return f[col('Tabla asistencia')] === 'NO'; })],
    ['Sin tabla de datos personales', cuenta(function (f) { return f[col('Tabla datos personales')] === 'NO'; })],
    ['Sin tabla historia/tratamiento', cuenta(function (f) { return f[col('Tabla historia/tratamiento')] === 'NO'; })],
    ['Nombre del Doc distinto del de la Maestra', cuenta(function (f) { return f[col('Nombre coincide')] === 'NO'; })],
    ['DNI del Doc distinto del de la Maestra', cuenta(function (f) { return f[col('DNI coincide')] === 'NO'; })],
    ['Con "Estado civil" rellenado en el Doc', cuenta(function (f) { return String(f[col('Estado civil (en el Doc)')]).trim() !== ''; })],
    ['Con imágenes', cuenta(function (f) { return num(f[col('Imágenes')]) > 0; })],
    ['Con formato (negrita, cursiva, subrayado, enlaces) en Historia/Tratamiento', cuenta(function (f) { return String(f[col('Formato en Historia/Tratamiento')]).trim() !== ''; })],
    ['Con marcadores {{ sin sustituir', cuenta(function (f) { return f[col('Marcadores {{ sin sustituir')] === 'SÍ'; })],
    ['Con más de un ingreso registrado', cuenta(function (f) { return num(f[col('Ingresos rellenos')]) > 1; })],
    ['Con alguna alta registrada', cuenta(function (f) { return num(f[col('Altas rellenas')]) > 0; })],
    ['', ''],
    ['Historia más larga (caracteres)', Math.max.apply(null, [0].concat(datos.map(function (f) { return num(f[col('Caracteres Historia')]); })))],
    ['Tratamiento más largo (caracteres)', Math.max.apply(null, [0].concat(datos.map(function (f) { return num(f[col('Caracteres Tratamiento')]); })))],
    ['Historia + tratamiento vacíos', cuenta(function (f) { return num(f[col('Caracteres Historia')]) === 0 && num(f[col('Caracteres Tratamiento')]) === 0; })]
  ];

  // Docs de la carpeta que no están enlazados en la Maestra (solo cuenta; no abre ninguno)
  try {
    const folderId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DRIVE_FOLDER_ID);
    if (folderId) {
      const enlazados = {};
      items.forEach(function (it) { if (it.docId) enlazados[it.docId] = true; });
      let enCarpeta = 0, sinEnlazar = 0;
      const files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.GOOGLE_DOCS);
      while (files.hasNext()) {
        const f = files.next();
        enCarpeta++;
        if (!enlazados[f.getId()]) sinEnlazar++;
      }
      filas.push(['', '']);
      filas.push(['Docs en la carpeta de Drive configurada', enCarpeta]);
      filas.push(['…de ellos, sin enlazar en la Maestra', sinEnlazar]);
    }
  } catch (e) {
    filas.push(['Carpeta de Drive', 'No se pudo leer: ' + e.message]);
  }

  let res = ss.getSheetByName(DIAG_HC_.HOJA_RESUMEN);
  if (res) res.clear(); else res = ss.insertSheet(DIAG_HC_.HOJA_RESUMEN);
  res.getRange(1, 1, 1, 2).setValues([['Concepto', 'Cantidad']]).setFontWeight('bold');
  res.getRange(2, 1, filas.length, 2).setValues(filas);
  res.setColumnWidth(1, 520);
}
