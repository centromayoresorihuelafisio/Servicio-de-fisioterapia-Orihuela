/**
 * Busca historias clínicas huérfanas cuyo nombre de archivo no coincide
 * exactamente con el paciente (errores de transcripción, nombres incompletos,
 * etc). Muestra hasta 5 candidatos por similitud de palabras para que el
 * usuario elija manualmente cuál vincular.
 */

// Mismo prefijo literal que ya usa _generarHistoriaClinicaEnFila (Historia
// Clínica.gs) al nombrar los documentos nuevos — con nombre aquí para no
// repetir el texto suelto dos veces.
const PREFIJO_HISTORIA_CLINICA_ = 'HISTORIA CLINICA ';

/** Entrada desde el menú de Sheets: usa la fila activa. */
function buscarHistoriaClinicaHuerfana() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) { ui.alert("Error: La hoja 'Base de Datos Maestra' no existe."); return; }

  const rowIndex = sheet.getActiveRange().getRow();
  if (rowIndex === 1) { ui.alert('Selecciona una fila que contenga los datos de un paciente.'); return; }

  const template = HtmlService.createTemplateFromFile('CandidatosHistoriaClinica');
  template.fila = rowIndex;
  const output = template.evaluate().setWidth(520).setHeight(620);
  ui.showModalDialog(output, 'Buscar Historia Clínica');
}

/**
 * Normaliza un texto para comparación: mayúsculas, sin tildes, espacios
 * colapsados. Mantiene la Ñ (no se toca).
 */
function _normalizarTexto(texto) {
  return (texto || '').toString()
    .toUpperCase()
    .replace(/Ñ/g, '\u0001') // aparta la Ñ antes de quitar tildes, para que NFD no la reduzca a N
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes de vocales (á, é, í, ó, ú)
    .replace(/\u0001/g, 'Ñ') // recupera la Ñ
    .replace(/\s+/g, ' ')
    .trim();
}

/** Similitud por tokens: proporción de palabras en común sobre el total de palabras únicas (índice de Jaccard). */
function _similitudNombres(nombreA, nombreB) {
  const tokensA = new Set(_normalizarTexto(nombreA).split(' ').filter(Boolean));
  const tokensB = new Set(_normalizarTexto(nombreB).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let comunes = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) comunes++; });

  const union = new Set([...tokensA, ...tokensB]).size;
  return comunes / union; // 0 a 1
}

/**
 * Devuelve los datos del paciente de `fila` y hasta 5 candidatos de la
 * carpeta de historias clínicas, ordenados por similitud de nombre.
 * Excluye archivos ya vinculados a OTRAS filas de la hoja.
 */
function obtenerCandidatosHistoriaClinica(fila) {
  const rowIndex = parseInt(fila, 10);
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };
  if (!rowIndex || rowIndex < 2) return { success: false, message: 'Fila de paciente no válida.' };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const idxNombre = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.NOMBRE.toLowerCase());
  const idxDni = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.DNI.toLowerCase());
  const idxHC = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());

  if (idxNombre === -1 || idxHC === -1) {
    return { success: false, message: 'No se encontraron las columnas de Nombre o Historia clínica.' };
  }

  const lastRow = sheet.getLastRow();
  const numRows = lastRow - 1;
  const data = sheet.getRange(2, 1, numRows, headers.length).getValues();
  const rangoHC = sheet.getRange(2, idxHC + 1, numRows, 1);
  const richTextHC = rangoHC.getRichTextValues();
  const formulasHC = rangoHC.getFormulas();

  const filaData = data[rowIndex - 2];
  if (!filaData) return { success: false, message: 'Fila fuera de rango.' };

  const nombre = (filaData[idxNombre] || '').toString().trim();
  const dni = idxDni !== -1 ? (filaData[idxDni] || '').toString().trim() : '';
  if (!nombre) return { success: false, message: 'Esa fila no tiene un paciente válido.' };

  // URL ya enlazada en ESTA fila (si existe, se avisa pero se permite corregir)
  const urlActual = extraerUrlHistoriaClinica(
    filaData[idxHC],
    richTextHC[rowIndex - 2][0],
    formulasHC[rowIndex - 2][0]
  );

  // URLs enlazadas en TODAS las demás filas, para excluir esos archivos de los candidatos
  const urlsUsadasPorOtros = new Set();
  for (let i = 0; i < numRows; i++) {
    if (i === rowIndex - 2) continue; // la propia fila no cuenta como "otro"
    const url = extraerUrlHistoriaClinica(data[i][idxHC], richTextHC[i][0], formulasHC[i][0]);
    if (url) urlsUsadasPorOtros.add(url);
  }

  // La carpeta de Historias Clínicas es la misma que configuras en
  // ⚙️ Cambiar Carpeta Destino Drive — no una carpeta aparte.
  const folderId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.DRIVE_FOLDER_ID);
  if (!folderId) {
    return { success: false, message: '⚠️ Falta configurar la Carpeta de Destino.\nVe al menú ⚙️ Config y actualiza el valor.' };
  }

  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const candidatos = [];
  while (files.hasNext()) {
    const f = files.next();
    const url = f.getUrl();
    if (urlsUsadasPorOtros.has(url)) continue; // ya pertenece a otro paciente

    const nombreArchivo = f.getName().replace(PREFIJO_HISTORIA_CLINICA_, '').trim();
    const score = _similitudNombres(nombre, nombreArchivo);
    if (score > 0) {
      candidatos.push({ fileId: f.getId(), fileName: f.getName(), url, score });
    }
  }

  candidatos.sort((a, b) => b.score - a.score);

  return {
    success: true,
    nombre,
    dni,
    yaEnlazada: !!urlActual,
    urlActual: urlActual || '',
    candidatos: candidatos.slice(0, 5)
  };
}

/**
 * Vincula el archivo elegido (fileId) a la fila indicada, y renombra el
 * archivo automáticamente a "HISTORIA CLINICA {NOMBRE} {DNI}" (o solo
 * {NOMBRE} si no hay DNI), usando el nombre correcto de la hoja.
 */
function vincularHistoriaClinicaHuerfana(fila, fileId) {
  const rowIndex = parseInt(fila, 10);
  const sheet = getSS().getSheetByName(SHEETS.MAESTRA);
  if (!sheet) return { success: false, message: "Error: La hoja 'Base de Datos Maestra' no existe." };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  const idxNombre = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.NOMBRE.toLowerCase());
  const idxDni = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.DNI.toLowerCase());
  const idxHC = headers.findIndex(h => h.toLowerCase() === COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());

  const rowData = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const nombre = (rowData[idxNombre] || '').toString().trim();
  const dni = idxDni !== -1 ? (rowData[idxDni] || '').toString().trim() : '';
  if (!nombre) return { success: false, message: 'Esa fila no tiene un paciente válido.' };

  const file = DriveApp.getFileById(fileId);

  // Renombrado automático con el nombre correcto de la hoja
  const nuevoNombre = `${PREFIJO_HISTORIA_CLINICA_}${nombre}${dni ? ' ' + dni : ''}`;
  if (file.getName() !== nuevoNombre) file.setName(nuevoNombre);

  const url = file.getUrl();
  const richText = SpreadsheetApp.newRichTextValue().setText('Ver Historia Clínica').setLinkUrl(url).build();
  sheet.getRange(rowIndex, idxHC + 1).setRichTextValue(richText);

  return { success: true, message: `Historia clínica vinculada y archivo renombrado a "${nuevoNombre}".`, url };
}