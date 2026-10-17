/**
 * Ficha de historia clínica (HC) en HTML dentro de la Web App (?page=hc).
 *
 * Lee y guarda en las hojas que creó la migración (herramientas/Migrar_HC.gs):
 *   "Historias Clínicas"  → ID HC | Nombre (referencia) | Historia | Tratamiento | Modificado (Doc) | Origen | Doc original
 *   "Episodios HC"        → ID HC | Ingreso | Alta | Nota
 * Los datos personales se leen de la Maestra, las escalas de "Valoraciones" y la asistencia de la Agenda.
 * No escribe NUNCA en la Maestra, en la Agenda, en Valoraciones ni en los Docs.
 *
 * FASE 1 (coexistencia): los Docs siguen siendo la fuente que usan Alta.gs / Generar.gs. Mientras
 * HC_WEB_MODO_PRUEBA sea true, la ficha avisa de que lo que se edite aquí vive solo en la nueva hoja.
 */

const HC_WEB_ = {
  HOJA_HC: 'Historias Clínicas',
  HOJA_EPI: 'Episodios HC',
  MAX_CARACTERES: 45000,         // límite de una celda de Sheets: 50.000
  COL: { ID: 1, NOMBRE: 2, HISTORIA: 3, TRATAMIENTO: 4, MODIFICADO: 5, ORIGEN: 6, DOC: 7 }
};

/** true → la ficha muestra un aviso de "modo prueba" (los cambios no llegan al Doc). Pasar a false al cambiar de fase. */
const HC_WEB_MODO_PRUEBA = true;

// Misma clasificación que ESTILOS_ASISTENCIA de agenda/Web_Vista.html (sobre texto sin tildes y en minúsculas).
const HC_ESTILOS_ASISTENCIA_ = [
  { clase: 'mal',    patron: /^no\b|^sin asist|falt|ausen|plant|no (vino|asist|acud|se present)/ },
  { clase: 'neutro', patron: /pendient|por confirmar|sin confirmar|sin registrar/ },
  { clase: 'aviso',  patron: /cancel|anul|aplaz|recuper|justific|retras/ },
  { clase: 'ok',     patron: /asist|vino|presente|realiz|acudi|^si$|^ok$/ }
];

/** Sirve la página de la ficha: ?page=hc&nombre=XXX  (o &fila=N de la Maestra). */
function servirFichaHCWeb(parametros) {
  const t = HtmlService.createTemplateFromFile('historia/HC_Vista');
  t.nombre = (parametros && parametros.nombre) || '';
  t.fila = (parametros && parametros.fila) || '';
  t.modoPrueba = HC_WEB_MODO_PRUEBA;
  t.baseUrl = ScriptApp.getService().getUrl();
  return t.evaluate().setTitle('Historia clínica').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ----------------------------------------------------------------------------- utilidades

function hcNorm_(s) {
  return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}
function hcDigitos_(s) { return String(s || '').replace(/\D/g, '').slice(-9); }
function hcDocId_(txt) { const m = String(txt || '').match(/[-\w]{25,}/); return m ? m[0] : ''; }
function hcAISO_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
function hcDeISO_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : '';
}
function hcMs_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v) ? v.getTime() : 0;
}

function hcHojas_() {
  const ss = getSS();
  const hc = ss.getSheetByName(HC_WEB_.HOJA_HC), epi = ss.getSheetByName(HC_WEB_.HOJA_EPI);
  if (!hc || !epi) throw new Error('Faltan las hojas "' + HC_WEB_.HOJA_HC + '" / "' + HC_WEB_.HOJA_EPI + '" (ejecuta la migración).');
  return { ss: ss, hc: hc, epi: epi };
}

/** Localiza la fila del usuario en la Maestra: por nombre si lo hay (las filas se reordenan), si no por fila. */
function hcLocalizarUsuario_(maestra, nombre, fila) {
  const colN = COLUMNAS_NUM.MAESTRA.NOMBRE, ult = maestra.getLastRow();
  if (ult < 2) return 0;
  const nombres = maestra.getRange(2, colN, ult - 1, 1).getValues();
  const objetivo = hcNorm_(nombre);
  if (objetivo) {
    for (let i = 0; i < nombres.length; i++) if (hcNorm_(nombres[i][0]) === objetivo) return i + 2;
    return 0;
  }
  const f = parseInt(fila, 10);
  return f >= 2 && f <= ult && nombres[f - 2][0] ? f : 0;
}

// ----------------------------------------------------------------------------- lectura

/**
 * Todo lo que necesita pintar la ficha, en una sola llamada.
 * @param {string} nombre Nombre del usuario (preferente) · @param {string|number} fila Fila de la Maestra (respaldo)
 */
function obtenerHCWeb(nombre, fila) {
  try {
    const h = hcHojas_(), tz = h.ss.getSpreadsheetTimeZone();
    const maestra = h.ss.getSheetByName(SHEETS.MAESTRA);
    if (!maestra) return { success: false, message: 'No se encontró la hoja "' + SHEETS.MAESTRA + '".' };

    const filaM = hcLocalizarUsuario_(maestra, nombre, fila);
    if (!filaM) return { success: false, message: 'No se encontró al usuario en la Base de Datos.' };

    // --- datos personales (una fila de la Maestra)
    const cab = maestra.getRange(1, 1, 1, maestra.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim().toLowerCase(); });
    const valores = maestra.getRange(filaM, 1, 1, cab.length).getValues()[0];
    const dato = function (col) {
      const i = cab.indexOf(String(col).trim().toLowerCase());
      if (i === -1) return '';
      let v = valores[i];
      if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz, 'dd/MM/yyyy');
      return v === null || v === undefined ? '' : String(v).trim();
    };
    const iHC = cab.indexOf(COLUMNAS.MAESTRA.HISTORIA_CLINICA.toLowerCase());
    let docUrl = '';
    if (iHC !== -1) {
      const c = maestra.getRange(filaM, iHC + 1);
      docUrl = extraerUrlHistoriaClinica(valores[iHC], c.getRichTextValue(), c.getFormula());
    }
    const usuario = {
      nombre: dato(COLUMNAS.MAESTRA.NOMBRE), dni: dato(COLUMNAS.MAESTRA.DNI),
      nacimiento: dato(COLUMNAS.MAESTRA.FECHA_NACIMIENTO), edad: dato(COLUMNAS.MAESTRA.EDAD),
      telefono: dato(COLUMNAS.MAESTRA.TELEFONO_1), telefono2: dato(COLUMNAS.MAESTRA.TELEFONO_2),
      inscripcion: dato(COLUMNAS.MAESTRA.FECHA_INSCRIPCION), estado: dato(COLUMNAS.MAESTRA.ESTADO),
      fila: filaM
    };

    // --- historia (por Doc original; respaldo: nombre de referencia, solo si es único)
    const ultHC = h.hc.getLastRow();
    if (ultHC < 2) return { success: false, message: 'La hoja "' + HC_WEB_.HOJA_HC + '" está vacía.' };
    const ids = h.hc.getRange(2, 1, ultHC - 1, 7).getValues();
    const docId = hcDocId_(docUrl);
    let idx = -1;
    if (docId) for (let i = 0; i < ids.length; i++) if (hcDocId_(ids[i][HC_WEB_.COL.DOC - 1]) === docId) { idx = i; break; }
    let porNombre = false;
    if (idx === -1) {
      const o = hcNorm_(usuario.nombre), c = [];
      ids.forEach(function (r, i) { if (hcNorm_(r[1]) === o) c.push(i); });
      if (c.length === 1) { idx = c[0]; porNombre = true; }
      else return { success: false, usuario: usuario, message: c.length
        ? 'Hay ' + c.length + ' historias con ese nombre y el enlace de la Maestra no coincide con ninguna: hay que revisarlo.'
        : 'Este usuario no tiene historia migrada.' };
    }
    const filaHC = idx + 2;
    const fila7 = h.hc.getRange(filaHC, 1, 1, 7).getValues()[0];
    const id = String(fila7[0]);

    // --- episodios
    const episodios = [];
    const ultE = h.epi.getLastRow();
    if (ultE > 1) h.epi.getRange(2, 1, ultE - 1, 4).getValues().forEach(function (r) {
      if (String(r[0]) === id) episodios.push({ ingreso: hcAISO_(r[1], tz), alta: hcAISO_(r[2], tz), nota: String(r[3] || '') });
    });
    episodios.sort(function (a, b) { return a.ingreso < b.ingreso ? -1 : a.ingreso > b.ingreso ? 1 : 0; });

    const resp = {
      success: true, id: id, usuario: usuario, porNombre: porNombre, docOriginal: String(fila7[6] || docUrl || ''),
      historia: String(fila7[2] || ''), tratamiento: String(fila7[3] || ''), modificado: hcMs_(fila7[4]),
      episodios: episodios, modoPrueba: HC_WEB_MODO_PRUEBA
    };
    // Las dos fuentes externas no deben impedir ver la historia si fallan.
    try { resp.valoraciones = hcLeerValoraciones_(h.ss, usuario, tz); } catch (e1) { resp.valoraciones = []; resp.avisoValoraciones = e1.message; }
    try {
      const desde = episodios.length ? episodios[episodios.length - 1].ingreso : '';
      resp.asistencia = hcContarAsistencia_(usuario, desde, tz);
    } catch (e2) { resp.asistencia = null; resp.avisoAsistencia = e2.message; }
    return resp;
  } catch (e) {
    Logger.log('Error en obtenerHCWeb: ' + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Valoraciones del usuario, de la más antigua a la más reciente. Si la fila trae DNI (columna 14, desde
 * 05/10/2026) y el usuario también, manda el DNI; si no, el nombre normalizado.
 */
function hcLeerValoraciones_(ss, usuario, tz) {
  const hoja = ss.getSheetByName(SHEETS.VALORACIONES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const C = COLUMNAS_NUM.VALORACIONES;
  const ncol = Math.min(hoja.getLastColumn(), C.DNI);
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, ncol).getValues();
  const nom = hcNorm_(usuario.nombre), dni = String(usuario.dni || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const num = function (v) { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  const out = [];
  filas.forEach(function (r) {
    const dniFila = String(r[C.DNI - 1] || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const coincide = (dniFila && dni) ? dniFila === dni : hcNorm_(r[C.NOMBRE - 1]) === nom;
    if (!coincide) return;
    const peg = [num(r[C.PEG_DOLOR - 1]), num(r[C.PEG_ACTIVIDAD - 1]), num(r[C.PEG_VIDA - 1])].filter(function (x) { return x !== null; });
    out.push({
      fecha: hcAISO_(r[C.FECHA - 1], tz), tipo: String(r[C.TIPO - 1] || ''),
      dolor: peg.length ? Math.round(peg.reduce(function (a, b) { return a + b; }, 0) / peg.length * 10) / 10 : null,
      funcion: num(r[C.FUNCION_GLOBAL - 1]), analg: num(r[C.ANALGESICOS - 1])
    });
  });
  out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  return out;
}

/**
 * Cuenta las citas del usuario en la Agenda del curso activo (y la del curso anterior si el episodio empezó antes),
 * por nombre + teléfono. Cuenta solo hasta hoy; lo pendiente va aparte y no entra en el porcentaje.
 */
function hcContarAsistencia_(usuario, desdeISO, tz) {
  const actual = obtenerHojaAgenda();
  const hojas = [actual];
  const m = actual.getName().match(/(\d{4})-(\d{4})/);
  if (m) {
    const prev = getSS().getSheetByName('Agenda ' + (+m[1] - 1) + '-' + (+m[2] - 1));
    if (prev && (!desdeISO || desdeISO < (+m[1]) + '-09-01')) hojas.push(prev);
  }
  const nom = hcNorm_(usuario.nombre);
  const tels = [hcDigitos_(usuario.telefono), hcDigitos_(usuario.telefono2)].filter(Boolean);
  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const r = { asistidas: 0, noAsistidas: 0, justificadas: 0, pendientes: 0, otras: 0, telefonoDistinto: 0 };

  hojas.forEach(function (hoja) {
    const ult = hoja.getLastRow(); if (ult < 2) return;
    const cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); });
    const cF = cab.indexOf(COLUMNAS.AGENDA.FECHA), cU = cab.indexOf(COLUMNAS.AGENDA.USUARIO),
          cT = cab.indexOf(COLUMNAS.AGENDA.TELEFONO), cA = cab.indexOf(COLUMNAS.AGENDA.ASISTENCIA);
    if (cF === -1 || cU === -1 || cA === -1) return;
    const filas = hoja.getRange(2, 1, ult - 1, Math.max(cF, cU, cT, cA) + 1).getValues();
    filas.forEach(function (f) {
      if (hcNorm_(f[cU]) !== nom) return;
      const fecha = hcAISO_(f[cF], tz);
      if (!fecha || (desdeISO && fecha < desdeISO)) return;
      const tAg = cT === -1 ? '' : hcDigitos_(f[cT]);
      if (tAg && tels.length && tels.indexOf(tAg) === -1) { r.telefonoDistinto++; return; }  // mismo nombre, otro teléfono: no se cuenta
      const v = hcNorm_(f[cA]).toLowerCase();
      let clase = 'neutro';
      if (v) for (let i = 0; i < HC_ESTILOS_ASISTENCIA_.length; i++) if (HC_ESTILOS_ASISTENCIA_[i].patron.test(v)) { clase = HC_ESTILOS_ASISTENCIA_[i].clase; break; }
      if (fecha > hoy || clase === 'neutro') { r.pendientes++; return; }
      if (clase === 'ok') r.asistidas++; else if (clase === 'mal') r.noAsistidas++; else if (clase === 'aviso') r.justificadas++; else r.otras++;
    });
  });
  return r;
}

// ----------------------------------------------------------------------------- escritura

/**
 * Guarda Historia o Tratamiento. `modificadoBase` es el valor de "modificado" que tenía la ficha al cargar:
 * si otra pestaña lo cambió entretanto, NO se sobrescribe y se avisa del conflicto.
 * @return {{success:boolean, conflicto?:boolean, modificado?:number, message?:string}}
 */
function guardarTextoHCWeb(id, campo, texto, modificadoBase) {
  const col = campo === 'historia' ? HC_WEB_.COL.HISTORIA : campo === 'tratamiento' ? HC_WEB_.COL.TRATAMIENTO : 0;
  if (!col) return { success: false, message: 'Campo no válido.' };
  texto = String(texto === null || texto === undefined ? '' : texto);
  if (texto.length > HC_WEB_.MAX_CARACTERES) return { success: false, message: 'El texto supera el límite de ' + HC_WEB_.MAX_CARACTERES + ' caracteres.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'La hoja está ocupada. Inténtalo de nuevo.' };
  try {
    const h = hcHojas_(), fila = hcFilaPorId_(h.hc, id);
    if (!fila) return { success: false, message: 'No se encontró la historia (ID no válido).' };
    const celdaMod = h.hc.getRange(fila, HC_WEB_.COL.MODIFICADO);
    const actual = hcMs_(celdaMod.getValue());
    if (modificadoBase && actual && Math.abs(actual - modificadoBase) > 1500) {
      return { success: false, conflicto: true, modificado: actual,
        message: 'Esta historia se ha modificado desde otra pestaña. Recarga la ficha para no perder cambios.' };
    }
    const celda = h.hc.getRange(fila, col);
    celda.setNumberFormat('@');          // texto plano: que Sheets no convierta "=..." en fórmula ni fechas en fecha
    celda.setValue(texto);
    const ahora = new Date();
    celdaMod.setNumberFormat('dd/MM/yyyy HH:mm:ss').setValue(ahora);
    SpreadsheetApp.flush();
    // Comprobación: lo escrito debe leerse igual.
    if (String(celda.getValue()) !== texto) return { success: false, message: 'La hoja no guardó el texto tal cual. No se ha perdido el original en pantalla.' };
    return { success: true, modificado: hcMs_(celdaMod.getValue()) };
  } catch (e) {
    Logger.log('Error en guardarTextoHCWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

/** Sustituye los episodios de una historia por la lista recibida [{ingreso:'yyyy-MM-dd', alta:'yyyy-MM-dd'|'', nota}]. */
function guardarEpisodiosHCWeb(id, episodios) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, message: 'La hoja está ocupada. Inténtalo de nuevo.' };
  try {
    const h = hcHojas_();
    if (!hcFilaPorId_(h.hc, id)) return { success: false, message: 'No se encontró la historia (ID no válido).' };
    const lista = (episodios || []).map(function (e) {
      return { ingreso: /^\d{4}-\d{2}-\d{2}$/.test(e.ingreso) ? e.ingreso : '', alta: /^\d{4}-\d{2}-\d{2}$/.test(e.alta) ? e.alta : '', nota: String(e.nota || '') };
    });
    if (lista.some(function (e) { return e.ingreso && e.alta && e.alta < e.ingreso; })) return { success: false, message: 'Un alta no puede ser anterior a su ingreso.' };

    // Se reescriben solo las filas de ESTA historia: las de las demás no se tocan.
    const ult = h.epi.getLastRow();
    const todas = ult > 1 ? h.epi.getRange(2, 1, ult - 1, 4).getValues() : [];
    const filasId = [];
    todas.forEach(function (r, i) { if (String(r[0]) === id) filasId.push(i + 2); });

    const nuevas = lista.map(function (e) { return [id, hcDeISO_(e.ingreso), hcDeISO_(e.alta), e.nota]; });
    // 1) se escriben en las filas que ya tenía (reutilizadas), 2) lo que sobre se añade al final, 3) las sobrantes se vacían.
    for (let k = 0; k < Math.min(nuevas.length, filasId.length); k++) {
      h.epi.getRange(filasId[k], 1, 1, 4).setValues([nuevas[k]]);
      h.epi.getRange(filasId[k], 2, 1, 2).setNumberFormat('dd/MM/yyyy');
    }
    if (nuevas.length > filasId.length) {
      const ini = h.epi.getLastRow() + 1, resto = nuevas.slice(filasId.length);
      if (h.epi.getMaxRows() < ini + resto.length - 1) h.epi.insertRowsAfter(h.epi.getMaxRows(), ini + resto.length - 1 - h.epi.getMaxRows());
      h.epi.getRange(ini, 1, resto.length, 4).setValues(resto);
      h.epi.getRange(ini, 2, resto.length, 2).setNumberFormat('dd/MM/yyyy');
    }
    for (let k = nuevas.length; k < filasId.length; k++) h.epi.getRange(filasId[k], 1, 1, 4).clearContent();
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    Logger.log('Error en guardarEpisodiosHCWeb: ' + e.message);
    return { success: false, message: e.message };
  } finally {
    lock.releaseLock();
  }
}

function hcFilaPorId_(hojaHC, id) {
  const ult = hojaHC.getLastRow();
  if (ult < 2 || !id) return 0;
  const ids = hojaHC.getRange(2, 1, ult - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
